#!/usr/bin/env python3
"""Fix syntax error in command_executor.py"""

file_path = r"c:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent\brain\command_executor.py"

# Read the file
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the escaped characters
bad_line = r'print(f\"[CommandExecutor] Failed to save pending validation: {e}\")' + '\n            \n            return {'
good_line = '                print(f"[CommandExecutor] Failed to save pending validation: {e}")\n            \n            return {'

content = content.replace(bad_line, good_line)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed syntax error in command_executor.py")
