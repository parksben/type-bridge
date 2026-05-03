package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// 钉钉 OpenAPI 端点
const (
	dingtalkAPIBase   = "https://api.dingtalk.com"
	dingtalkTokenURL  = dingtalkAPIBase + "/v1.0/oauth2/accessToken"
	dingtalkFileDlURL = dingtalkAPIBase + "/v1.0/robot/messageFiles/download"
)

// SDK 没有暴露 access token 管理，这里自己维护一个简单缓存。
// 钉钉 token 有效期 2h；提前 5min 刷新避免 race。
type accessTokenCache struct {
	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

var (
	tokenCache  accessTokenCache
	clientIDVar string
	clientSecVar string
)

// initTokenCache 记住凭据供后续 getAccessToken / downloadImage 使用。
// 在 main 启动时调一次即可。
func initTokenCache(clientID, clientSecret string) {
	clientIDVar = clientID
	clientSecVar = clientSecret
}

func getAccessToken(ctx context.Context) (string, error) {
	tokenCache.mu.Lock()
	defer tokenCache.mu.Unlock()

	// 5min 预刷新窗口
	if tokenCache.token != "" && time.Until(tokenCache.expiresAt) > 5*time.Minute {
		return tokenCache.token, nil
	}

	body, _ := json.Marshal(map[string]string{
		"appKey":    clientIDVar,
		"appSecret": clientSecVar,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dingtalkTokenURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("get token: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var parsed struct {
		AccessToken string `json:"accessToken"`
		ExpireIn    int64  `json:"expireIn"` // seconds
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("get token: empty accessToken in response: %s", string(raw))
	}

	tokenCache.token = parsed.AccessToken
	tokenCache.expiresAt = time.Now().Add(time.Duration(parsed.ExpireIn) * time.Second)
	return parsed.AccessToken, nil
}

// downloadMessageFile 用 downloadCode + robotCode 换一个短期签名 URL，
// 再下载原始字节，base64 编码返回给调用方。
// robotCode 就是 clientID（AppKey）。
func downloadMessageFile(ctx context.Context, downloadCode string) (dataB64, mime string, err error) {
	token, err := getAccessToken(ctx)
	if err != nil {
		return "", "", fmt.Errorf("access token: %w", err)
	}

	// Step 1: 拿签名 URL
	reqBody, _ := json.Marshal(map[string]string{
		"downloadCode": downloadCode,
		"robotCode":    clientIDVar,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dingtalkFileDlURL, bytes.NewReader(reqBody))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-acs-dingtalk-access-token", token)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", err
	}
	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("get download url: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var parsed struct {
		DownloadURL string `json:"downloadUrl"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", "", err
	}
	if parsed.DownloadURL == "" {
		return "", "", fmt.Errorf("empty downloadUrl: %s", string(raw))
	}

	// Step 2: 从签名 URL 拿字节
	fileResp, err := client.Get(parsed.DownloadURL)
	if err != nil {
		return "", "", fmt.Errorf("fetch file: %w", err)
	}
	defer fileResp.Body.Close()

	bytesData, err := io.ReadAll(fileResp.Body)
	if err != nil {
		return "", "", err
	}

	mime = fileResp.Header.Get("Content-Type")
	if mime == "" {
		mime = "image/png"
	} else {
		mime = strings.Split(mime, ";")[0]
	}
	return base64.StdEncoding.EncodeToString(bytesData), mime, nil
}
