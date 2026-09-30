import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

export interface CopyButtonProps {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}
