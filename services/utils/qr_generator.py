"""
QR Code Generator Utility for FTP Server
Generates QR codes for easy mobile FTP connection
"""

import qrcode
import io
import base64
from typing import Optional


def generate_ftp_qr(username: str, password: str, ip: str, port: int = 2121) -> Optional[str]:
    """
    Generate a QR code for FTP connection credentials.
    
    Args:
        username: FTP username
        password: FTP password
        ip: Server IP address
        port: FTP port (default: 2121)
    
    Returns:
        Base64-encoded PNG image string, or None on error
    """
    try:
        # Format FTP URL
        ftp_url = f"ftp://{username}:{password}@{ip}:{port}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,  # Auto-adjust size
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(ftp_url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        
        return img_base64
    
    except Exception as e:
        print(f"❌ QR code generation failed: {e}")
        return None


if __name__ == "__main__":
    # Test QR generation
    test_qr = generate_ftp_qr("fluffy", "testpass123", "192.168.1.100", 2121)
    if test_qr:
        print(f"✓ QR code generated successfully ({len(test_qr)} chars)")
        print(f"✓ Preview: {test_qr[:50]}...")
    else:
        print("✗ QR code generation failed")
