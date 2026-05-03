package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"testing"
)

func TestDecryptImageRoundtrip(t *testing.T) {
	// 32 字节 key（可见字符便于肉眼调试；真实 key 是随机字节）
	keyBytes := []byte("0123456789abcdef0123456789abcdef") // 32 字节
	keyB64 := base64.StdEncoding.EncodeToString(keyBytes)
	iv := keyBytes[:16]

	plaintext := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG magic
		'P', 'N', 'G', ' ', 'f', 'i', 'x', 't', 'u', 'r', 'e',
	}

	// PKCS#7 pad 到 16 的倍数（企微文档说 32，但标准 PKCS#7 块对齐即可）
	bs := aes.BlockSize
	padLen := bs - len(plaintext)%bs
	padded := make([]byte, len(plaintext)+padLen)
	copy(padded, plaintext)
	for i := len(plaintext); i < len(padded); i++ {
		padded[i] = byte(padLen)
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	mode := cipher.NewCBCEncrypter(block, iv)
	ciphertext := make([]byte, len(padded))
	mode.CryptBlocks(ciphertext, padded)

	decrypted, err := decryptImage(ciphertext, keyB64)
	if err != nil {
		t.Fatalf("decryptImage: %v", err)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("roundtrip mismatch:\n  want %x\n  got  %x", plaintext, decrypted)
	}

	if mime := detectMime(decrypted); mime != "image/png" {
		t.Errorf("expected image/png, got %s", mime)
	}
}

func TestDecryptImageRejectsBadPad(t *testing.T) {
	keyBytes := []byte("0123456789abcdef0123456789abcdef")
	keyB64 := base64.StdEncoding.EncodeToString(keyBytes)
	iv := keyBytes[:16]

	// 故意构造错误 pad：最后一字节是 99（> 32）
	bad := make([]byte, aes.BlockSize)
	bad[aes.BlockSize-1] = 99

	block, _ := aes.NewCipher(keyBytes)
	mode := cipher.NewCBCEncrypter(block, iv)
	enc := make([]byte, aes.BlockSize)
	mode.CryptBlocks(enc, bad)

	if _, err := decryptImage(enc, keyB64); err == nil {
		t.Error("expected error on bad padding, got nil")
	}
}
