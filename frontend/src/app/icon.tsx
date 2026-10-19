import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: '#0d1210', border: '4px solid #3fbf8f', color: '#e9efec', fontSize: 34, fontWeight: 800, letterSpacing: -2 }}>
        B
      </div>
    ),
    { ...size },
  );
}
