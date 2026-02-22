import type { Card } from '@/types/mahjong';
import { cn } from '@/lib/utils';
import { cardToLabel, getTileBackImage, getTileImageFromCard } from '@/lib/mahjongTiles';

interface MahjongCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  hidden?: boolean;
  className?: string;
}

export function MahjongCard({ 
  card, 
  size = 'md', 
  selectable = false, 
  selected = false,
  onClick,
  hidden = false,
  className
}: MahjongCardProps) {
  const sizeClasses = {
    sm: 'w-8 h-11 text-xs',
    md: 'w-12 h-16 text-sm',
    lg: 'w-16 h-[5.5rem] text-base'
  };

  return (
    <button
      onClick={onClick}
      disabled={!selectable}
      className={cn(
        'relative overflow-hidden rounded-sm border-2 border-stone-900 font-bold shadow-sm',
        'flex items-center justify-center',
        'bg-stone-100 transition-all duration-150',
        sizeClasses[size],
        selectable && 'cursor-pointer hover:-translate-y-1 hover:shadow-md',
        selected && 'ring-2 ring-amber-500 ring-offset-2 -translate-y-1 shadow-lg',
        card.isMagic && 'ring-2 ring-yellow-400 ring-offset-1',
        className
      )}
    >
      <img
        src={hidden ? getTileBackImage() : getTileImageFromCard(card)}
        alt={hidden ? '牌背' : cardToLabel(card)}
        className="h-full w-full select-none object-cover [image-rendering:pixelated]"
        draggable={false}
      />
      {card.isMagic && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-sm border border-yellow-700 bg-yellow-400 text-[8px] text-yellow-900">
          神
        </span>
      )}
    </button>
  );
}

export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-11',
    md: 'w-12 h-16',
    lg: 'w-16 h-[5.5rem]'
  };

  return (
    <div className={cn(
      'overflow-hidden rounded-sm border-2 border-slate-600 bg-slate-700',
      'flex items-center justify-center',
      sizeClasses[size]
    )}>
      <img
        src={getTileBackImage()}
        alt="牌背"
        className="h-full w-full select-none object-cover [image-rendering:pixelated]"
        draggable={false}
      />
    </div>
  );
}
