import type { ReactNode, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

export interface CopyButtonProps {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
}

export interface MenuProps {
  label: string;
  items: MenuItem[];
  triggerClassName?: string;
}

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}
