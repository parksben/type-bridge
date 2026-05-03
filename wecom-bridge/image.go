// image.go — 图片下载 + AES-256-CBC 解密
//
// 企微长连接图片协议（官方 2026/04/15）：
//   image.url   —— HTTPS 下载地址，5 分钟有效期
//   image.aeskey —— base64 编码的 32 字节 key；IV = 前 16 字节
//   加密算法：AES-256-CBC + PKCS#7 填充到 32 字节倍数

package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

func downloadAndDecrypt(ctx context.Context, url, aesKeyB64 string) (plain []byte, mime string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	httpClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("http status %d", resp.StatusCode)
	}
	buf, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read body: %w", err)
	}
	plain, err = decryptImage(buf, aesKeyB64)
	if err != nil {
		return nil, "", err
	}
	return plain, detectMime(plain), nil
}

// decryptImage AES-256-CBC + PKCS#7 unpad；IV = aeskey 前 16 字节
func decryptImage(ciphertext []byte, aesKeyB64 string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(aesKeyB64)
	if err != nil {
		return nil, fmt.Errorf("base64 decode key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("expected 32-byte key, got %d", len(key))
	}
	if len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("ciphertext not aligned to 16 bytes (len=%d)", len(ciphertext))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes NewCipher: %w", err)
	}
	iv := key[:aes.BlockSize]
	mode := cipher.NewCBCDecrypter(block, iv)

	out := make([]byte, len(ciphertext))
	mode.CryptBlocks(out, ciphertext)

	// PKCS#7 unpad —— 文档说 pad 到 32 字节倍数，但标准 PKCS#7 只要块对齐即可；
	// 按标准 PKCS#7 解（取最后一字节为 pad 数）。pad 必须在 [1, 32]。
	n := int(out[len(out)-1])
	if n < 1 || n > 32 || n > len(out) {
		return nil, errors.New("invalid PKCS#7 padding")
	}
	// 可选校验：最后 n 字节都应等于 n
	for i := len(out) - n; i < len(out); i++ {
		if out[i] != byte(n) {
			return nil, errors.New("corrupt PKCS#7 padding bytes")
		}
	}
	return out[:len(out)-n], nil
}

// detectMime 按魔数识别 PNG / JPEG / GIF / WebP；其他一律 application/octet-stream
func detectMime(data []byte) string {
	switch {
	case len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}):
		return "image/png"
	case len(data) >= 3 && bytes.Equal(data[:3], []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg"
	case len(data) >= 6 && (bytes.Equal(data[:6], []byte("GIF87a")) || bytes.Equal(data[:6], []byte("GIF89a"))):
		return "image/gif"
	case len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")):
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

// stdBase64 包装一下，避免调用方重复引用 encoding/base64
func stdBase64(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}
