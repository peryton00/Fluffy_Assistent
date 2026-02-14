import sys
import os

# Fix Flask Windows issue
os.environ["FLASK_SKIP_DOTENV"] = "1"

# Add parent directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

print(f"Running from: {current_dir}")
print(f"Parent dir: {parent_dir}")

try:
    print("Importing web_api...")
    # Add brain to sys.path so 'brain.web_api' works or just 'web_api' if inside package
    from brain.web_api import app, start_api
    print("Import successful. Starting API...")
    start_api()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
