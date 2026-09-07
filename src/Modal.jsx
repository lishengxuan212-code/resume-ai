import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const lastFocus = document.activeElement;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      lastFocus?.focus?.();
    };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
      <header className="modal-header"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={22} /></button></header>
      {children}
    </dialog>
  );
}
