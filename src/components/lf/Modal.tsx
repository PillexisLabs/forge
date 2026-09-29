'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';

// A small centred modal in the Lightfield style: icon and title, the
// fields, and the actions at the bottom right.
export default function Modal({
  open,
  onClose,
  icon,
  title,
  wide = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  icon: string;
  title: string;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'lf-modal lf-modal-wide' : 'lf-modal'}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {open && (
        <>
          <div className="lf-modal-head">
            <Icon name={icon} />
            <h2>{title}</h2>
            <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="lf-modal-body">{children}</div>
          {footer && <div className="lf-modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
