import os
from PIL import Image

def convert_png_to_webp():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cards_dir = os.path.join(base_dir, "國字認字卡")
    
    if not os.path.exists(cards_dir):
        print(f"找不到圖卡目錄: {cards_dir}")
        return
        
    converted_count = 0
    errors_count = 0
    
    for root, _, files in os.walk(cards_dir):
        for file in files:
            if file.lower().endswith('.png'):
                png_path = os.path.join(root, file)
                # 新的 WebP 路徑
                webp_filename = os.path.splitext(file)[0] + '.webp'
                webp_path = os.path.join(root, webp_filename)
                
                try:
                    # 開啟圖片並存為 WebP
                    with Image.open(png_path) as img:
                        img.save(webp_path, 'WEBP', quality=85)
                    # 刪除原有的 PNG
                    os.remove(png_path)
                    print(f"已轉換: {file} -> {webp_filename}")
                    converted_count += 1
                except Exception as e:
                    print(f"轉換失敗: {file} ({e})")
                    errors_count += 1
                    
    print(f"\n轉換完成！成功轉換 {converted_count} 張圖片，失敗 {errors_count} 張。")

if __name__ == "__main__":
    convert_png_to_webp()
