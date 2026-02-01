
import os

files = [
    r"app\dashboard\admin\UserManagement.tsx",
    r"app\dashboard\admin\page.tsx",
    r"app\dashboard\admin\domains\page.tsx",
    r"app\supervisor\page.tsx",
    r"app\articles\new\page.tsx",
    r"components\QuickArticleModal.tsx",
    r"app\articles\[slug]\page.tsx",
    r"components\EmbeddedArticleViewer.tsx",
    r"app\page.tsx",
    r"components\PostCard.tsx",
    r"components\VotingSlider.tsx",
    r"app\create\page.tsx",
    r"app\profile\[id]\page.tsx",
    r"components\ProfileEditor.tsx",
    r"components\DiagramComparison.tsx",
    r"components\EnhancedDiagramComparison.tsx",
    r"components\SimplePostCard.tsx",
    r"components\AdminPostCard.tsx",
    r"app\auth\signup\page.tsx",
    r"app\auth\signin\page.tsx",
    r"app\articles\[slug]\edit\page.tsx"
]

replacements = {
    "bg-dark-bg": "bg-site-bg",
    "bg-dark-card": "bg-site-card",
    "bg-dark-secondary": "bg-site-secondary",
    "bg-dark-border": "bg-site-border",
    "border-dark-border": "border-site-border",
    "text-dark-text": "text-site-text",
    "text-dark-muted": "text-site-muted",
    "text-dark-secondary": "text-site-secondary",
    "divide-dark-border": "divide-site-border",
    "ring-dark-border": "ring-site-border",
    "from-dark-bg": "from-site-bg",
    "to-dark-bg": "to-site-bg",
    "from-dark-card": "from-site-card",
    "to-dark-card": "to-site-card"
}

base_path = r"c:\Users\Hamed\SITEMAN"

for file_rel in files:
    file_path = os.path.join(base_path, file_rel)
    if not os.path.exists(file_path):
        print(f"Skipping {file_path} (not found)")
        continue
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content
        for old, new in replacements.items():
            new_content = new_content.replace(old, new)
        
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
        else:
            print(f"No changes in {file_path}")
            
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
