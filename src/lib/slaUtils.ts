export function priorityWeight(p: string) {
  return { urgent: 4, high: 3, medium: 2, low: 1 }[p] || 2;
}

export function priorityBarColor(p: string) {
  return (
    { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-slate-400' }[p] || 'bg-blue-500'
  );
}
