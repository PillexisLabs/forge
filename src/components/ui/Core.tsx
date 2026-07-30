'use client';

/* Hallmark · component: core UI system · genre: modern-minimal · theme: studied ProductLogz DNA
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (40–41) · pre-emit critique: P5 H5 E5 S5 R5 V4
 */

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type UiState = 'default' | 'loading' | 'error' | 'success';
export type UiTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'critical';

export function UiButton({
  children,
  className,
  state = 'default',
  variant = 'secondary',
  size = 'medium',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: UiState;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium';
}) {
  const isLoading = state === 'loading';

  return (
    <button
      {...props}
      className={classes('ui-button', `ui-button-${variant}`, `ui-button-${size}`, className)}
      data-state={state}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading && <span className="ui-button-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function UiField({
  children,
  label,
  hint,
  error,
  success,
  className,
}: {
  children: ReactElement<any>;
  label: string;
  hint?: string;
  error?: string;
  success?: string;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = children.props.id || generatedId;
  const message = error || success || hint;
  const messageId = message ? `${controlId}-message` : undefined;
  const state = error ? 'error' : success ? 'success' : 'default';
  const control = cloneElement(children, {
    id: controlId,
    className: classes('ui-control', children.props.className),
    'aria-describedby': messageId,
    'aria-invalid': error ? true : undefined,
    'data-state': state,
  });

  return (
    <label className={classes('ui-field', className)} htmlFor={controlId} data-state={state}>
      <span className="ui-field-label">{label}</span>
      {control}
      <span
        id={messageId}
        className="ui-field-message"
        aria-live={error ? 'polite' : undefined}
      >
        {message}
      </span>
    </label>
  );
}

export function UiBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: UiTone;
  className?: string;
}) {
  return (
    <span className={classes('ui-badge', className)} data-tone={tone}>
      {children}
    </span>
  );
}

export function UiAvatar({
  name,
  seed = 0,
  size = 'medium',
  className,
}: {
  name: string;
  seed?: number;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <span
      className={classes('ui-avatar', `ui-avatar-${seed % 6}`, `ui-avatar-${size}`, className)}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function UiPanel({
  as: Element = 'section',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'aside' | 'div';
}) {
  return <Element {...props} className={classes('ui-panel', className)} />;
}

export function UiPanelHeader({
  title,
  description,
  meta,
  className,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={classes('ui-panel-header', className)}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {meta && <div className="ui-panel-meta">{meta}</div>}
    </header>
  );
}

export function UiAlert({
  children,
  tone = 'critical',
  className,
}: {
  children: ReactNode;
  tone?: 'info' | 'critical' | 'positive';
  className?: string;
}) {
  return (
    <p
      className={classes('ui-alert', className)}
      data-tone={tone}
      role={tone === 'critical' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function UiDialog({
  children,
  className,
  labelId,
  open,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  labelId: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Native <dialog> does not lock the page behind it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={classes('ui-dialog', className)}
      aria-labelledby={labelId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
