import { ImageResponse } from 'next/og';

export const alt = 'Bastion Academy - practical cybersecurity learning';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #0d1210 0%, #151b18 58%, #193e30 100%)', color: '#e9efec' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 58, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3fbf8f', color: '#0d1210', borderRadius: 12, fontSize: 34, fontWeight: 800 }}>B</div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>BASTION ACADEMY</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 5, color: '#3fbf8f' }}>CYBERSECURITY LEARNING</div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 64, lineHeight: 1.08, fontWeight: 800, letterSpacing: -2 }}>Train practical skills.<br />Build your defenses.</div>
          <div style={{ display: 'flex', fontSize: 26, color: '#b7c8bf' }}>Structured lessons | Live learning | Secure access</div>
        </div>
        <div style={{ display: 'flex', fontSize: 16, letterSpacing: 3, color: '#8fa096' }}>LEARN WITH PURPOSE</div>
      </div>
    ),
    { ...size },
  );
}
