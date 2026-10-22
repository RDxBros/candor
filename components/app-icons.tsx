type IconProps = { className?: string };

export function ExternalIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5H4.8A1.8 1.8 0 0 0 3 6.8v8.4A1.8 1.8 0 0 0 4.8 17h8.4a1.8 1.8 0 0 0 1.8-1.8V13M10 3h7v7M17 3l-8 8" /></svg>;
}

export function FlagIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M5 18V3m0 1h9l-2 3 2 3H5" /></svg>;
}

export function CheckIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" /></svg>;
}

export function XIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>;
}

export function FreezeIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v16M3.1 6l13.8 8M3.1 14l13.8-8M7 4l3 2 3-2M7 16l3-2 3 2M4 9l3 1-1 3m10-2-3-1 1-3" /></svg>;
}

export function FireIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M10.2 18c-3.6 0-6.2-2.3-6.2-5.7 0-2.2 1.1-4.2 3.2-6.1.1 1.8.8 2.9 1.8 3.5C8.8 6.3 10.5 3.8 13 2c.1 2.7 3 4.6 3 8.8 0 4.2-2.5 7.2-5.8 7.2Z" /><path d="M8 14.1c0-1.3.8-2.5 2.3-3.7.1 1.5 1.7 2.2 1.7 3.8 0 1.3-.8 2.3-2 2.3s-2-1-2-2.4Z" /></svg>;
}

export function ArrowIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4" /></svg>;
}

export function BackIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4m4-4-4 4 4 4" /></svg>;
}

export function ChevronDownIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>;
}

export function MenuIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>;
}

export function LockIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V6a3 3 0 0 1 6 0v2" /></svg>;
}

export function UnlockIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M13 8V6a3 3 0 0 0-5.8-1" /></svg>;
}

export function ClockIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></svg>;
}
