import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './loading-overlay.css';

const encouragements = [
  ['每一步，都算数。', '那些认真做过的事，值得被好好看见。'],
  ['经验不必耀眼，真实就有力量。', '把你的行动讲清楚，让机会更了解你。'],
  ['下一站，向心仪的工作出发。', '一次认真准备，就是向前迈出的一步。'],
  ['跨过这一关，继续向前。', '好的表达，帮助你的努力被看见。'],
];
const titles = { extracting: '正在读取你的简历', diagnosing: '正在梳理你的经历', optimizing: '正在优化你的简历', downloading: '正在生成 PDF' };

export function LoadingOverlay({ stage }) {
  const ref = useRef(null);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);
  const [quote, caption] = encouragements[Math.floor(seconds / 9) % encouragements.length];
  return createPortal(<dialog ref={ref} tabIndex={-1} className={`loading-overlay ${paused ? 'is-paused' : ''}`} aria-labelledby="loading-title" aria-describedby="loading-hint" onCancel={e => e.preventDefault()}>
    <div className="loading-topline"><span className="loading-label">ON THE WAY TO YOUR NEXT CHAPTER</span><button type="button" className="loading-motion" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? '继续动画' : '暂停动画'}</button></div>
    <div className="offer-quest" aria-hidden="true">
      <svg viewBox="0 0 480 180" role="presentation" shapeRendering="crispEdges">
        <defs><pattern id="quest-bricks" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#574a39"/><path d="M0 0H24M0 0V16M12 0V8M0 8H24" stroke="#2c2923" strokeWidth="2"/></pattern></defs>
        <g fill="#393a36"><path d="M30 45h24v4H30zM40 35h4v24h-4zM330 22h16v3h-16zM337 15h3v16h-3z"/><path d="M74 80h36v4H74zM87 70h4v24h-4z" opacity=".5"/></g>
        <path d="M0 145H480V180H0Z" fill="url(#quest-bricks)"/><path d="M0 143H480" stroke="#aca084" strokeWidth="3"/>
        <g fill="url(#quest-bricks)" stroke="#9c8966" strokeWidth="2"><path d="M124 123h28v20h-28zM230 110h28v33h-28zM334 119h28v24h-28z"/></g>
        <g className="quest-coin" fill="#e7bb70"><path d="M141 64h10v4h4v12h-4v4h-10v-4h-4V68h4z"/><path d="M146 69v10" stroke="#8c6431" strokeWidth="2"/></g>
        <g className="quest-coin quest-coin-two" fill="#e7bb70"><path d="M241 50h10v4h4v12h-4v4h-10v-4h-4V54h4z"/></g>
        <g className="quest-goal"><path d="M425 48v95" stroke="#a09c88" strokeWidth="3"/><path d="M425 48h36v25h-36z" fill="#c9d8b0"/><path d="M434 55l10 7 10-7M434 55h20v12h-20z" fill="none" stroke="#45533a" strokeWidth="2"/><text x="405" y="35" fill="#ded6bc" fontSize="12" fontFamily="monospace">OFFER</text></g>
        <g className="quest-runner"><g className="quest-body">
          <path d="M4 0h16v4H0V4h4z" fill="#dfb878"/><path d="M4 4h16v12H4z" fill="#e5c9a8"/><path d="M16 6h3v3h-3z" fill="#292824"/><path d="M0 16h24v14H0z" fill="#c5d6b3"/><path d="M8 17h8v13H8z" fill="#738d6a"/><path d="M-4 18h4v10h-4zM24 18h4v10h-4z" fill="#e5c9a8"/>
          <path className="quest-leg-a" d="M3 30h7v9H0v-4h3z" fill="#dfb878"/><path className="quest-leg-b" d="M15 30h7v5h3v4H15z" fill="#dfb878"/>
        </g></g>
      </svg>
      <div className="quest-caption"><span>勇气</span><span>积累</span><span>表达</span><span>下一站</span></div>
    </div>
    <p className="loading-stage" id="loading-title" role="status"><span className="loading-dot"/>{titles[stage]}</p>
    <div className="loading-encouragement" key={Math.floor(seconds / 9)}><h2>{quote}</h2><p>{caption}</p></div>
    <div className="loading-footer"><span className="loading-elapsed">已等待 {seconds} 秒</span><p id="loading-hint">{seconds >= 45 ? '这次处理比平时久一些，仍在准备结果。请保持页面打开。' : '请稍候，完成后会自动展示结果。'}</p></div>
  </dialog>, document.body);
}
