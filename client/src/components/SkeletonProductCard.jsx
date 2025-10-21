import React from 'react';

export default function SkeletonProductCard() {
  return (
    <div className="card relative animate-skeleton" aria-hidden="true" role="presentation">
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-alt">
        <div className="absolute inset-0 bg-surface-alt" />
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="h-3 w-3/4 rounded bg-surface-alt" />
        <div className="h-3 w-1/2 rounded bg-surface-alt" />
        <div className="mt-auto h-4 w-1/3 rounded bg-surface-alt" />
      </div>
    </div>
  );
}
