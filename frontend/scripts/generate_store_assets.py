import os
from PIL import Image, ImageOps, ImageFilter

src_dir = r'd:\my_git\CatHeadTab\猫头'
dest_dir = r'd:\my_git\CatHeadTab\frontend\store_assets'

# Final requirements from Google: 1280x800, No Alpha, JPG
TARGET_SIZE = (1280, 800)

def process_image_with_blur_bg(src_name, dest_name, target_size=TARGET_SIZE):
    """Resizes image to fit target size, placing it over a blurred version of itself to avoid black bars."""
    src_path = os.path.join(src_dir, src_name)
    dest_path = os.path.join(dest_dir, dest_name)
    
    if not os.path.exists(src_path):
        print(f"Skipping {src_name}: File not found")
        return False
        
    img = Image.open(src_path).convert('RGB')
    
    # --- 1. Create Blurred Background ---
    # Scale to fill (Fit) then blur
    bg = ImageOps.fit(img, target_size, Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=30))
    # Darken the background slightly for better contrast
    bg = bg.point(lambda p: p * 0.7) 
    
    # --- 2. Scale Original to Fit ---
    # Resizes so that the whole image is visible
    img.thumbnail(target_size, Image.Resampling.LANCZOS)
    
    # --- 3. Composite ---
    offset = ((target_size[0] - img.size[0]) // 2, (target_size[1] - img.size[1]) // 2)
    bg.paste(img, offset)
    
    bg.save(dest_path, 'JPEG', quality=95)
    print(f"Generated (Blur BG): {dest_name}")
    return True

def stitch_side_by_side_v2(src1, src2, dest_name, target_size=TARGET_SIZE):
    """Stitches two images side-by-side with a blurred background."""
    path1 = os.path.join(src_dir, src1)
    path2 = os.path.join(src_dir, src2)
    
    if not os.path.exists(path1) or not os.path.exists(path2):
        return
        
    img1 = Image.open(path1).convert('RGB')
    img2 = Image.open(path2).convert('RGB')
    
    # Background (using src1 for BG)
    bg = ImageOps.fit(img1, target_size, Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=30)).point(lambda p: p * 0.7)
    
    # Each image gets half width minus some margin
    half_w = target_size[0] // 2
    max_h = target_size[1] - 40 # 20px padding
    
    img1.thumbnail((half_w - 40, max_h), Image.Resampling.LANCZOS)
    img2.thumbnail((half_w - 40, max_h), Image.Resampling.LANCZOS)
    
    # Paste
    off1 = (20 + (half_w - 20 - img1.size[0]) // 2, (target_size[1] - img1.size[1]) // 2)
    off2 = (half_w + 20 + (half_w - 40 - img2.size[0]) // 2, (target_size[1] - img2.size[1]) // 2)
    
    bg.paste(img1, off1)
    bg.paste(img2, off2)
    
    dest_path = os.path.join(dest_dir, dest_name)
    bg.save(dest_path, 'JPEG', quality=95)
    print(f"Generated (Stitched Blur BG): {dest_name}")

# --- Execute ---
if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

# Screenshots
process_image_with_blur_bg('demo2 (2).png', 'screenshot_1_dashboard.jpg')
stitch_side_by_side_v2('aiagent1.png', 'aiagent2.png', 'screenshot_2_ai_combined.jpg')
stitch_side_by_side_v2('bookmarks.png', 'history.png', 'screenshot_3_productivity.jpg')
process_image_with_blur_bg('setting.png', 'screenshot_4_settings.jpg')
process_image_with_blur_bg('lockscreen.png', 'screenshot_5_lockscreen.jpg')

# Promo Tiles
process_image_with_blur_bg('demo2 (2).png', 'small_tile_440x280.jpg', (440, 280))
process_image_with_blur_bg('demo2 (2).png', 'marquee_1400x560.jpg', (1400, 560))

print("\nAll assets updated with professional BLURRED background. No black bars!")
