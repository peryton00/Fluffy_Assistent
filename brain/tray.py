import threading
import sys
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw

# Simple colored circle icons
def create_icon(color):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((8, 8, 56, 56), fill=color)
    return img


class FluffyTray:
    def __init__(self):
        self.icon = Icon(
            "Fluffy",
            create_icon("green"),
            "Fluffy Desktop",
            menu=Menu(
                MenuItem("Status: Running", self.noop, enabled=False),
                Menu.SEPARATOR,
                MenuItem("Open Dashboard", self.open_dashboard),
                MenuItem("Quit Fluffy", self.quit),
            ),
        )

    def run(self):
        threading.Thread(target=self.icon.run, daemon=True).start()

    def set_status(self, level):
        colors = {
            "LOW": "green",
            "MEDIUM": "yellow",
            "HIGH": "orange",
            "CRITICAL": "red",
            "NORMAL": "green",
            "BUSY": "orange",
            "OVERLOADED": "red",
        }

        color = colors.get(level, "green")
        self.icon.icon = create_icon(color)
        self.icon.title = f"Fluffy — {level}"

    def noop(self):
        pass

    def open_dashboard(self, icon=None, item=None):
        import webbrowser
        webbrowser.open("http://127.0.0.1:5123/")

    def quit(self, icon=None, item=None):
        self.icon.stop()

