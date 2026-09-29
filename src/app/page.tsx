import LotteryWorkspace from "@/components/LotteryWorkspace";
import { loadGame } from "@/lib/data";
import { loadDigitGame } from "@/lib/digit-data";
import { encodeDraws, encodeDigits } from "@/lib/compact";
import { GAMES } from "@/lib/games";
import { systemTickets } from "@/lib/recommendation";

export default function Home() {
  const dlt = loadGame("dlt"), ssq = loadGame("ssq"), p5 = loadDigitGame("p5");
  const draws = { dlt: dlt.draws, ssq: ssq.draws, p5: p5.draws };
  return <LotteryWorkspace compact={{
    dlt: encodeDraws(dlt.draws, GAMES.dlt.redCount, GAMES.dlt.blueCount),
    ssq: encodeDraws(ssq.draws, GAMES.ssq.redCount, GAMES.ssq.blueCount),
    p5: encodeDigits(p5.draws, 5),
  }} initial={{ dlt: systemTickets("dlt", draws), ssq: systemTickets("ssq", draws), p5: systemTickets("p5", draws) }} />;
}
