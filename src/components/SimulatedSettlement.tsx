export function SimulatedSettlement({ stake, profit }: { stake: number; profit: number }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
      <span className="whitespace-nowrap">投入 {stake}</span>
      <span className="whitespace-nowrap font-semibold">返还 {(stake + profit).toFixed(2)}</span>
      <span className="whitespace-nowrap">净盈亏 {profit.toFixed(2)}</span>
    </span>
  );
}
