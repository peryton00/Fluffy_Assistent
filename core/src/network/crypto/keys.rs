use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

const KEY_MAGIC: &[u8; 5] = b"FLKEY";
const KEY_VERSION_1: u8 = 0x01;

const BACKEND_DPAPI: u8 = 0x01;
#[allow(dead_code)]
const BACKEND_UNIX_OWNER: u8 = 0x02;

/// 32-byte static X25519 public key for cryptographic node identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PublicKey(pub [u8; 32]);

impl PublicKey {
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    pub fn to_hex(&self) -> String {
        self.0.iter().map(|b| format!("{:02x}", b)).collect()
    }

    pub fn from_hex(hex_str: &str) -> Result<Self, String> {
        let clean = hex_str.trim();
        if clean.len() != 64 {
            return Err(format!("Invalid public key length: expected 64 hex characters, got {}", clean.len()));
        }
        let mut bytes = [0u8; 32];
        for i in 0..32 {
            bytes[i] = u8::from_str_radix(&clean[i * 2..i * 2 + 2], 16)
                .map_err(|e| format!("Invalid hex byte at index {}: {}", i, e))?;
        }
        Ok(Self(bytes))
    }

    /// Derive a human-readable 16-character fingerprint for UI display.
    pub fn fingerprint(&self) -> String {
        let hex = self.to_hex();
        format!("{}:{}", &hex[0..8], &hex[56..64])
    }
}

impl fmt::Display for PublicKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_hex())
    }
}

impl AsRef<[u8]> for PublicKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Node static cryptographic keypair for Noise_XX authentication.
/// Private key material is never serialized or exposed over public API boundaries.
#[derive(Clone)]
pub struct NodeKeypair {
    pub public: PublicKey,
    private: [u8; 32],
}

impl fmt::Debug for NodeKeypair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("NodeKeypair")
            .field("public", &self.public)
            .field("private", &"[REDACTED_PRIVATE_KEY]")
            .finish()
    }
}

#[cfg(windows)]
mod platform_crypto {
    use std::ptr;

    #[repr(C)]
    struct CryptoapiBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const CryptoapiBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const CryptoapiBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut CryptoapiBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const CryptoapiBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const CryptoapiBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut CryptoapiBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    pub const CURRENT_BACKEND: u8 = super::BACKEND_DPAPI;

    pub fn protect_private_key(plaintext: &[u8; 32]) -> Result<Vec<u8>, String> {
        let data_in = CryptoapiBlob {
            cb_data: plaintext.len() as u32,
            pb_data: plaintext.as_ptr() as *mut u8,
        };
        let mut data_out = CryptoapiBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };

        let res = unsafe {
            CryptProtectData(
                &data_in,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut data_out,
            )
        };

        if res == 0 || data_out.pb_data.is_null() {
            return Err("Windows DPAPI encryption failed".to_string());
        }

        let slice = unsafe { std::slice::from_raw_parts(data_out.pb_data, data_out.cb_data as usize) };
        let ciphertext = slice.to_vec();
        unsafe { LocalFree(data_out.pb_data as *mut _) };
        Ok(ciphertext)
    }

    pub fn unprotect_private_key(ciphertext: &[u8]) -> Result<[u8; 32], String> {
        let data_in = CryptoapiBlob {
            cb_data: ciphertext.len() as u32,
            pb_data: ciphertext.as_ptr() as *mut u8,
        };
        let mut data_out = CryptoapiBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };

        let res = unsafe {
            CryptUnprotectData(
                &data_in,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut data_out,
            )
        };

        if res == 0 || data_out.pb_data.is_null() {
            return Err("Windows DPAPI decryption failed (corrupted ciphertext or invalid context)".to_string());
        }

        let slice = unsafe { std::slice::from_raw_parts(data_out.pb_data, data_out.cb_data as usize) };
        if slice.len() != 32 {
            unsafe { LocalFree(data_out.pb_data as *mut _) };
            return Err(format!("Decrypted private key length invalid: expected 32 bytes, got {}", slice.len()));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(slice);
        unsafe { LocalFree(data_out.pb_data as *mut _) };
        Ok(key)
    }

    pub fn enforce_file_permissions(_path: &std::path::Path) -> Result<(), String> {
        // Windows DPAPI natively restricts access to the current user token
        Ok(())
    }
}

#[cfg(unix)]
mod platform_crypto {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    pub const CURRENT_BACKEND: u8 = super::BACKEND_UNIX_OWNER;

    pub fn protect_private_key(plaintext: &[u8; 32]) -> Result<Vec<u8>, String> {
        Ok(plaintext.to_vec())
    }

    pub fn unprotect_private_key(ciphertext: &[u8]) -> Result<[u8; 32], String> {
        if ciphertext.len() != 32 {
            return Err(format!("Invalid private key length: expected 32 bytes, got {}", ciphertext.len()));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(ciphertext);
        Ok(key)
    }

    pub fn enforce_file_permissions(path: &Path) -> Result<(), String> {
        let metadata = fs::metadata(path)
            .map_err(|e| format!("Failed to read metadata for {:?}: {}", path, e))?;
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set 0600 permissions on {:?}: {}", path, e))?;
        Ok(())
    }
}

#[cfg(not(any(windows, unix)))]
mod platform_crypto {
    use std::path::Path;

    pub const CURRENT_BACKEND: u8 = 0x00;

    pub fn protect_private_key(plaintext: &[u8; 32]) -> Result<Vec<u8>, String> {
        Ok(plaintext.to_vec())
    }

    pub fn unprotect_private_key(ciphertext: &[u8]) -> Result<[u8; 32], String> {
        if ciphertext.len() != 32 {
            return Err(format!("Invalid private key length: expected 32 bytes, got {}", ciphertext.len()));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(ciphertext);
        Ok(key)
    }

    pub fn enforce_file_permissions(_path: &Path) -> Result<(), String> {
        Ok(())
    }
}

impl NodeKeypair {
    /// Generate a fresh random static keypair using Snow Noise builder
    pub fn generate() -> Result<Self, String> {
        let builder = snow::Builder::new(
            "Noise_XX_25519_ChaChaPoly_SHA256"
                .parse()
                .map_err(|e| format!("Noise pattern parse error: {:?}", e))?,
        );
        let keypair = builder
            .generate_keypair()
            .map_err(|e| format!("Keypair generation error: {:?}", e))?;

        let mut pub_bytes = [0u8; 32];
        let mut priv_bytes = [0u8; 32];

        if keypair.public.len() != 32 || keypair.private.len() != 32 {
            return Err("Generated keypair length mismatch: expected 32-byte keys".into());
        }

        pub_bytes.copy_from_slice(&keypair.public);
        priv_bytes.copy_from_slice(&keypair.private);

        Ok(Self {
            public: PublicKey(pub_bytes),
            private: priv_bytes,
        })
    }

    /// Construct from explicit byte arrays
    pub fn from_bytes(public: [u8; 32], private: [u8; 32]) -> Self {
        Self {
            public: PublicKey(public),
            private,
        }
    }

    /// Access private key slice for internal cryptographic operations only
    pub fn private_bytes(&self) -> &[u8; 32] {
        &self.private
    }

    /// Get default security storage path for this platform
    pub fn default_key_path() -> PathBuf {
        let base = dirs::data_local_dir()
            .map(|p| p.join("Fluffy"))
            .or_else(|| dirs::home_dir().map(|p| p.join(".fluffy")))
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("keys").join("node_identity.key")
    }

    /// Load keypair from file or generate and save a new one if missing
    pub fn load_or_generate(path: &Path) -> Result<Self, String> {
        if path.exists() {
            Self::load_from_file(path)
        } else {
            let keypair = Self::generate()?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create key directory: {}", e))?;
            }
            keypair.save_to_file(path)?;
            Ok(keypair)
        }
    }

    /// Load keypair from specified path with envelope parsing and transparent legacy migration
    pub fn load_from_file(path: &Path) -> Result<Self, String> {
        let bytes = fs::read(path).map_err(|e| format!("Failed to read key file: {}", e))?;

        // 1. Check for legacy 64-byte plaintext file (32B public + 32B private)
        if bytes.len() == 64 && !bytes.starts_with(KEY_MAGIC) {
            log::info!("[SEC-01] Detected legacy plaintext key file; migrating to protected format: {:?}", path);
            let mut pub_bytes = [0u8; 32];
            let mut priv_bytes = [0u8; 32];
            pub_bytes.copy_from_slice(&bytes[0..32]);
            priv_bytes.copy_from_slice(&bytes[32..64]);

            let keypair = Self {
                public: PublicKey(pub_bytes),
                private: priv_bytes,
            };

            // Atomically migrate legacy key to protected envelope
            keypair.save_to_file(path)?;
            return Ok(keypair);
        }

        // 2. Parse versioned envelope
        // Minimum envelope length: 5 (magic) + 1 (ver) + 1 (backend) + 32 (pub) + 4 (len) = 43 bytes
        if bytes.len() < 43 || !bytes.starts_with(KEY_MAGIC) {
            return Err("Invalid or corrupted key file: missing FLKEY envelope magic".to_string());
        }

        let version = bytes[5];
        if version != KEY_VERSION_1 {
            return Err(format!("Unsupported key envelope version: 0x{:02x}", version));
        }

        let backend = bytes[6];
        let mut pub_bytes = [0u8; 32];
        pub_bytes.copy_from_slice(&bytes[7..39]);

        let payload_len = u32::from_be_bytes([bytes[39], bytes[40], bytes[41], bytes[42]]) as usize;
        if bytes.len() != 43 + payload_len {
            return Err(format!(
                "Malformed key envelope: expected total {} bytes, got {}",
                43 + payload_len,
                bytes.len()
            ));
        }

        let payload = &bytes[43..43 + payload_len];

        let private = match backend {
            #[cfg(windows)]
            BACKEND_DPAPI => platform_crypto::unprotect_private_key(payload)?,
            #[cfg(unix)]
            BACKEND_UNIX_OWNER => platform_crypto::unprotect_private_key(payload)?,
            #[cfg(not(any(windows, unix)))]
            0x00 => platform_crypto::unprotect_private_key(payload)?,
            _ => {
                return Err(format!(
                    "Unsupported or incompatible key storage backend identifier: 0x{:02x}",
                    backend
                ));
            }
        };

        Ok(Self {
            public: PublicKey(pub_bytes),
            private,
        })
    }

    /// Save keypair to specified path with OS protection, atomic write replacement, and safe cleanup
    pub fn save_to_file(&self, path: &Path) -> Result<(), String> {
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;

        let protected_payload = platform_crypto::protect_private_key(&self.private)?;

        let mut envelope = Vec::with_capacity(43 + protected_payload.len());
        envelope.extend_from_slice(KEY_MAGIC);
        envelope.push(KEY_VERSION_1);
        envelope.push(platform_crypto::CURRENT_BACKEND);
        envelope.extend_from_slice(&self.public.0);
        envelope.extend_from_slice(&(protected_payload.len() as u32).to_be_bytes());
        envelope.extend_from_slice(&protected_payload);

        let temp_filename = format!(
            ".{}.tmp.{}",
            path.file_name().and_then(|s| s.to_str()).unwrap_or("key"),
            uuid::Uuid::new_v4()
        );
        let temp_path = parent.join(temp_filename);

        if let Err(e) = fs::write(&temp_path, &envelope) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to write temporary key file: {}", e));
        }

        if let Err(e) = platform_crypto::enforce_file_permissions(&temp_path) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to set permissions on key file: {}", e));
        }

        // Atomic replace
        #[cfg(windows)]
        {
            if path.exists() {
                // On Windows, rename might fail if target exists in some filesystems/permissions.
                // Replace atomically if possible or remove then rename.
                if let Err(err) = fs::rename(&temp_path, path) {
                    let _ = fs::remove_file(path);
                    if let Err(retry_err) = fs::rename(&temp_path, path) {
                        let _ = fs::remove_file(&temp_path);
                        return Err(format!("Failed to replace target key file on Windows: {} (retry: {})", err, retry_err));
                    }
                }
            } else if let Err(e) = fs::rename(&temp_path, path) {
                let _ = fs::remove_file(&temp_path);
                return Err(format!("Failed to move key file to target path: {}", e));
            }
        }

        #[cfg(not(windows))]
        {
            if let Err(e) = fs::rename(&temp_path, path) {
                let _ = fs::remove_file(&temp_path);
                return Err(format!("Failed to atomically rename key file: {}", e));
            }
        }

        Ok(())
    }
}

/// Derive a mutual Short Authentication String (SAS) 6-digit code from two public keys.
/// Both initiator and responder compute the exact same SAS code regardless of order.
pub fn derive_sas(key_a: &PublicKey, key_b: &PublicKey) -> String {
    let mut combined = [0u8; 64];
    if key_a.0 < key_b.0 {
        combined[0..32].copy_from_slice(&key_a.0);
        combined[32..64].copy_from_slice(&key_b.0);
    } else {
        combined[0..32].copy_from_slice(&key_b.0);
        combined[32..64].copy_from_slice(&key_a.0);
    }

    // Deterministic 6-digit numeric hash
    let mut hash: u32 = 5381;
    for &b in &combined {
        hash = hash.wrapping_mul(33).wrapping_add(b as u32);
    }
    let code = hash % 1_000_000;
    format!("{:06}", code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation_and_hex() {
        let keypair = NodeKeypair::generate().expect("keypair generation failed");
        assert_eq!(keypair.public.as_bytes().len(), 32);
        assert_eq!(keypair.private_bytes().len(), 32);

        let hex = keypair.public.to_hex();
        assert_eq!(hex.len(), 64);

        let parsed = PublicKey::from_hex(&hex).expect("from_hex failed");
        assert_eq!(parsed, keypair.public);
    }

    #[test]
    fn test_sas_derivation_order_invariance() {
        let k1 = NodeKeypair::generate().unwrap();
        let k2 = NodeKeypair::generate().unwrap();

        let sas1 = derive_sas(&k1.public, &k2.public);
        let sas2 = derive_sas(&k2.public, &k1.public);

        assert_eq!(sas1, sas2);
        assert_eq!(sas1.len(), 6);
        assert!(sas1.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn test_protected_envelope_roundtrip_and_no_plaintext() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_test_keys_{}", uuid::Uuid::new_v4()));
        let key_path = temp_dir.join("node.key");

        let generated = NodeKeypair::load_or_generate(&key_path).expect("load or generate failed");
        assert!(key_path.exists());

        // Read raw file on disk
        let raw_bytes = fs::read(&key_path).expect("failed to read key file");
        assert!(raw_bytes.starts_with(b"FLKEY\x01"));

        #[cfg(windows)]
        {
            // Verify on Windows that raw 32-byte private key is NOT in the file
            let priv_slice = generated.private_bytes();
            let contains_plaintext = raw_bytes.windows(32).any(|w| w == priv_slice);
            assert!(!contains_plaintext, "On-disk key file must not contain raw plaintext private key bytes");
        }

        let loaded = NodeKeypair::load_from_file(&key_path).expect("load from file failed");
        assert_eq!(generated.public, loaded.public);
        assert_eq!(generated.private_bytes(), loaded.private_bytes());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_corrupted_key_fails_closed() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_test_keys_{}", uuid::Uuid::new_v4()));
        let key_path = temp_dir.join("node.key");

        let _ = NodeKeypair::load_or_generate(&key_path).expect("generate failed");
        let mut raw_bytes = fs::read(&key_path).unwrap();

        // Corrupt encrypted payload bytes
        let len = raw_bytes.len();
        raw_bytes[len - 5] ^= 0xff;
        raw_bytes[len - 2] ^= 0xaa;
        fs::write(&key_path, raw_bytes).unwrap();

        let load_res = NodeKeypair::load_from_file(&key_path);
        assert!(load_res.is_err(), "Loading corrupted key must fail closed");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_truncated_key_fails_closed() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_test_keys_{}", uuid::Uuid::new_v4()));
        let key_path = temp_dir.join("node.key");

        let _ = NodeKeypair::load_or_generate(&key_path).expect("generate failed");
        let raw_bytes = fs::read(&key_path).unwrap();

        // Truncate file to partial header
        let truncated = &raw_bytes[0..20];
        fs::write(&key_path, truncated).unwrap();

        let load_res = NodeKeypair::load_from_file(&key_path);
        assert!(load_res.is_err(), "Loading truncated key must fail closed");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_legacy_plaintext_key_migration() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_test_keys_{}", uuid::Uuid::new_v4()));
        let key_path = temp_dir.join("legacy_node.key");
        let _ = fs::create_dir_all(&temp_dir);

        let orig = NodeKeypair::generate().unwrap();
        let mut legacy_bytes = Vec::with_capacity(64);
        legacy_bytes.extend_from_slice(&orig.public.0);
        legacy_bytes.extend_from_slice(orig.private_bytes());
        fs::write(&key_path, legacy_bytes).unwrap();

        // Load legacy key - should detect and migrate
        let migrated = NodeKeypair::load_from_file(&key_path).expect("migration failed");
        assert_eq!(orig.public, migrated.public);
        assert_eq!(orig.private_bytes(), migrated.private_bytes());

        // Verify that the file on disk is now in FLKEY format
        let disk_bytes = fs::read(&key_path).unwrap();
        assert!(disk_bytes.starts_with(b"FLKEY\x01"));

        // Load again from migrated file
        let reloaded = NodeKeypair::load_from_file(&key_path).expect("reloading migrated key failed");
        assert_eq!(orig.public, reloaded.public);
        assert_eq!(orig.private_bytes(), reloaded.private_bytes());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_noise_xx_handshake_with_loaded_keypairs() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_test_keys_{}", uuid::Uuid::new_v4()));
        let key_path_a = temp_dir.join("node_a.key");
        let key_path_b = temp_dir.join("node_b.key");

        let _keypair_a = NodeKeypair::load_or_generate(&key_path_a).expect("generate a failed");
        let _keypair_b = NodeKeypair::load_or_generate(&key_path_b).expect("generate b failed");

        // Reload them from disk to ensure full decryption roundtrip
        let loaded_a = NodeKeypair::load_from_file(&key_path_a).expect("load a failed");
        let loaded_b = NodeKeypair::load_from_file(&key_path_b).expect("load b failed");

        // Execute Noise XX handshake between loaded_a (initiator) and loaded_b (responder)
        let builder_i = snow::Builder::new("Noise_XX_25519_ChaChaPoly_SHA256".parse().unwrap());
        let mut noise_i = builder_i.local_private_key(loaded_a.private_bytes()).build_initiator().unwrap();

        let builder_r = snow::Builder::new("Noise_XX_25519_ChaChaPoly_SHA256".parse().unwrap());
        let mut noise_r = builder_r.local_private_key(loaded_b.private_bytes()).build_responder().unwrap();

        let mut buf_i = [0u8; 1024];
        let mut buf_r = [0u8; 1024];

        // -> e
        let len = noise_i.write_message(&[], &mut buf_i).unwrap();
        noise_r.read_message(&buf_i[..len], &mut buf_r).unwrap();

        // <- e, ee, s, es
        let len = noise_r.write_message(&[], &mut buf_r).unwrap();
        noise_i.read_message(&buf_r[..len], &mut buf_i).unwrap();

        // -> s, se
        let len = noise_i.write_message(&[], &mut buf_i).unwrap();
        noise_r.read_message(&buf_i[..len], &mut buf_r).unwrap();

        assert!(noise_i.is_handshake_finished());
        assert!(noise_r.is_handshake_finished());

        let remote_static_on_responder = noise_r.get_remote_static().unwrap();
        assert_eq!(remote_static_on_responder, loaded_a.public.as_bytes());

        let remote_static_on_initiator = noise_i.get_remote_static().unwrap();
        assert_eq!(remote_static_on_initiator, loaded_b.public.as_bytes());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
