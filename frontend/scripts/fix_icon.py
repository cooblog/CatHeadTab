from PIL import Image, ImageDraw
import os

input_path = r'd:\my_git\CatHeadTab\frontend\store_icon.png'
output_path = r'd:\my_git\CatHeadTab\frontend\store_icon_128.png'

if not os.path.exists(input_path):
    print(f"Error: Input file not found: {input_path}")
    exit(1)

# Open image and ensure it's RGBA
img = Image.open(input_path).convert('RGBA')

# ---- STEP 1: FLOOD FILL BACKGROUND TO TRANSPARENT ----
# We use flood fill to find the white background starting from the corners.
width, height = img.size

# We create a single-channel grayscale image (L) to use as a mask
# Initially, all pixels are 255 (opaque)
mask = Image.new('L', (width, height), 255)

# Use ImageDraw to flood fill parts of the mask with 0 (transparent)
# We fill from the corners assuming they are background
draw = ImageDraw.Draw(mask)

# We base the fill on the original image's brightness/color
# But since floodfill only works with a single color, we use a 
# trick: we search for white-ish pixels in the original.
# A better way is to flood fill on a temp image and then extract the alpha.

temp_img = img.convert('RGB')
for corner in [(0,0), (width-1, 0), (0, height-1), (width-1, height-1)]:
    # Flood fill the background in temp_img with a unique color (e.g. magenta)
    ImageDraw.floodfill(temp_img, corner, (255, 0, 255), thresh=30)

# Create the alpha mask: if temp_img is magenta, alpha is 0
new_data = []
for p in temp_img.getdata():
    if p == (255, 0, 255):
        new_data.append(0)
    else:
        new_data.append(255)

mask.putdata(new_data)
img.putalpha(mask)

# ---- STEP 2: RESIZE AND PAD ----
img.thumbnail((96, 96), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
offset = ((128 - img.size[0]) // 2, (128 - img.size[1]) // 2)
canvas.paste(img, offset, img)

# Save
canvas.save(output_path, 'PNG')
print(f"Successfully created transparent icon: {output_path}")
