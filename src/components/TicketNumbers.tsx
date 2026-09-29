import type { Ticket } from "@/lib/notebook";
import type { Draw } from "@/lib/games";
import type { DigitDraw } from "@/lib/digit";

export default function TicketNumbers({ ticket, drawn, small = false }: { ticket: Ticket; drawn?: Draw | DigitDraw; small?: boolean }) {
  const ball = (n: number, color: string, hit: boolean, key: string) => <span key={key}
    className={`number-chip ${color} ${small ? "number-small" : ""} ${drawn ? hit ? "number-hit" : "number-miss" : ""}`}
    title={drawn ? hit ? "命中" : "未命中" : undefined}>
    {ticket.game === "p5" ? n : String(n).padStart(2, "0")}{drawn && hit && <span className="hit-mark">✓</span>}
  </span>;
  return <div className="ticket-numbers" aria-label={ticket.game === "p5" ? "按从左到右的位置排列" : "前区或红球，加号后为后区或蓝球"}>
    {ticket.game === "p5" ? ticket.digits.map((n, i) => ball(n, "number-purple", !!drawn && "digits" in drawn && drawn.digits[i] === n, `d${i}`)) : <>
      {ticket.red.map((n) => ball(n, "number-red", !!drawn && "red" in drawn && drawn.red.includes(n), `r${n}`))}
      <span className="number-plus">+</span>
      {ticket.blue.map((n) => ball(n, "number-blue", !!drawn && "blue" in drawn && drawn.blue.includes(n), `b${n}`))}
    </>}
  </div>;
}
