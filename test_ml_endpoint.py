"""
Test script for Sketchify ML Endpoint
Run this to test the endpoint locally or after deployment

Usage:
    python test_ml_endpoint.py http://localhost:5001
    python test_ml_endpoint.py https://your-railway-app.railway.app
"""

import requests
import base64
import sys
from pathlib import Path

def test_health(base_url):
    """Test health check endpoint"""
    print("\n🔍 Testing Health Check...")
    try:
        response = requests.get(f"{base_url}/health", timeout=10)
        if response.status_code == 200:
            print("✅ Health check passed")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_styles(base_url):
    """Test styles endpoint"""
    print("\n🎨 Testing Styles Endpoint...")
    try:
        response = requests.get(f"{base_url}/api/styles", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Styles endpoint passed")
            print(f"   Available styles: {data['count']}")
            print(f"   Styles: {', '.join(data['styles'][:5])}...")
            return True
        else:
            print(f"❌ Styles endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_sketch_generation(base_url, image_path="test_image.jpg"):
    """Test sketch generation with real image"""
    print(f"\n🎨 Testing Sketch Generation...")
    
    # Check if test image exists
    if not Path(image_path).exists():
        print(f"⚠️  Test image not found: {image_path}")
        print(f"   Creating a simple test image...")
        create_test_image(image_path)
    
    try:
        # Read and encode image
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        # Prepare request
        payload = {
            "image": image_data,
            "style": "realistic-pencil",
            "description": "Test sketch generation"
        }
        
        print("   Sending request to endpoint...")
        response = requests.post(
            f"{base_url}/api/sketch",
            json=payload,
            timeout=120  # 2 minute timeout for DALL-E generation
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ Sketch generation passed!")
                print(f"   Sketch URL: {data['sketch_url'][:60]}...")
                print(f"   Description: {data['description']}")
                print(f"   Style: {data['style']}")
                return True
            else:
                print(f"❌ Generation failed: {data.get('error')}")
                return False
        else:
            print(f"❌ Request failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except requests.Timeout:
        print("⏱️  Request timed out (DALL-E generation takes 20-30 seconds)")
        print("   Try again - this is normal for first request")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def create_test_image(filename="test_image.jpg"):
    """Create a simple test image"""
    try:
        from PIL import Image
        
        # Create a simple test image (portrait)
        img = Image.new('RGB', (512, 512), color='white')
        
        # Draw some simple shapes
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        
        # Draw circle in center
        draw.ellipse([200, 50, 450, 300], outline='black', width=3)
        
        # Draw rectangle
        draw.rectangle([100, 350, 400, 480], outline='black', width=3)
        
        # Draw line
        draw.line([100, 100, 400, 400], fill='black', width=2)
        
        img.save(filename)
        print(f"✅ Created test image: {filename}")
        return filename
        
    except ImportError:
        print("⚠️  Pillow not installed. Install with: pip install Pillow")
        return None
    except Exception as e:
        print(f"❌ Failed to create test image: {e}")
        return None

def main():
    print("=" * 60)
    print("Sketchify ML Endpoint - Test Suite")
    print("=" * 60)
    
    # Get base URL from command line or use default
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5001"
    base_url = base_url.rstrip('/')
    
    print(f"\n📍 Testing endpoint: {base_url}")
    print(f"⏰ This may take 1-2 minutes for full test (DALL-E generation is slow)")
    
    results = {
        "Health Check": test_health(base_url),
        "Styles Endpoint": test_styles(base_url),
        "Sketch Generation": False  # Skip by default due to cost
    }
    
    # Ask user if they want to test sketch generation
    print("\n" + "=" * 60)
    print("📊 Test Results Summary")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("\n🎉 All tests passed! Your endpoint is ready to use.")
        print(f"\n📝 Add this URL to Sketchify:")
        print(f"   {base_url}/api/sketch")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")
        if "localhost" in base_url:
            print("   Make sure ml_endpoint.py is running: python ml_endpoint.py")
        else:
            print("   Check Railway logs for more details")

if __name__ == "__main__":
    main()
