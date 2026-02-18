from PIL import Image
import io
import sys
try:
    import requests
except ImportError:
    print('requests not installed', file=sys.stderr)
    raise

def main():
    # create test image
    img = Image.new('RGB', (512, 320), (200,180,255))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    files = {'file': ('test.png', buf, 'image/png')}
    data = {'artStyle':'pencil', 'style':'line', 'intensity':'6'}
    url = 'http://localhost:5001/api/style-transfer-advanced'
    print('POSTing to', url)
    resp = requests.post(url, files=files, data=data, timeout=30)
    print('Status:', resp.status_code)
    if resp.status_code == 200:
        out = 'result.png'
        with open(out, 'wb') as f:
            f.write(resp.content)
        print('Saved', out, 'size', len(resp.content))
    else:
        print('Response:', resp.text[:400])

if __name__ == '__main__':
    main()
