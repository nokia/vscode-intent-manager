import os
import time

def main():
    
    # Cd to the directory of the script
    os.chdir(os.path.dirname(os.path.realpath(__file__)))
    
    # uninstall the old version
    os.system("code --uninstall-extension *.vsix")

    # delete the old vsix file
    os.system("rm -rf *.vsix")

    # compile the extension
    os.system("npm run compile")
    
    # change npm version to 18
    os.system("nvm use node")
    time.sleep(1) # wait for npm version to update
    os.system("npm -v")
    os.system("npm install -g typescript")
    os.system("npm install -g @vscode/vsce")
    os.system("npm list -g")
    os.system("npm install . ")
    os.system("npm list")
    os.system("vsce package")

    # Install the vsix file
    os.system("code --install-extension *.vsix")

    # Intstall the
if __name__ == "__main__":
    main()

# Run the script> python3 build_vsix.py