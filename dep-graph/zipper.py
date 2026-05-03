import os
import zipfile
import sys

def create_zip(zip_path, root_dir):
    exclusions = [
        ".git", "node_modules", ".session-collector-bin", ".venv", "__pycache__",
        ".cache", ".next", "dist", "coverage"
    ]
    exclusion_exts = [".tsbuildinfo", ".DS_Store", ".log", ".pem", "project.zip"]
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(root_dir):
            # remove excluded dirs
            dirs[:] = [d for d in dirs if d not in exclusions and not d.startswith(".env")]
            
            for file in files:
                if any(file.endswith(ext) for ext in exclusion_exts) or file == "project.zip" or file.startswith(".env"):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, root_dir)
                zipf.write(file_path, arcname)

if __name__ == "__main__":
    create_zip(sys.argv[1], sys.argv[2])
