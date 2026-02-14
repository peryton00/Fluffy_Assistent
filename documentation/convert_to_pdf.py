"""
PDF Converter for PowerPoint Presentation
Converts the generated PPTX to PDF format
"""

import comtypes.client
import os

def convert_pptx_to_pdf():
    """Convert PowerPoint to PDF using comtypes"""
    
    # File paths
    pptx_path = r"C:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent\documentation\presentation.pptx"
    pdf_path = r"C:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent\documentation\presentation.pdf"
    
    # Check if PPTX exists
    if not os.path.exists(pptx_path):
        print(f"❌ Error: PowerPoint file not found at {pptx_path}")
        return False
    
    try:
        # Initialize PowerPoint
        powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
        powerpoint.Visible = 1
        
        # Open presentation
        print("📂 Opening PowerPoint presentation...")
        presentation = powerpoint.Presentations.Open(pptx_path)
        
        # Save as PDF
        print("📄 Converting to PDF...")
        presentation.SaveAs(pdf_path, 32)  # 32 = ppSaveAsPDF
        
        # Close presentation
        presentation.Close()
        powerpoint.Quit()
        
        print(f"✅ PDF created successfully at: {pdf_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        print("\n💡 Alternative: You can manually export the PowerPoint to PDF:")
        print("   1. Open presentation.pptx in PowerPoint")
        print("   2. File → Export → Create PDF/XPS")
        print("   3. Save as presentation.pdf in the documentation folder")
        return False

if __name__ == "__main__":
    convert_pptx_to_pdf()
