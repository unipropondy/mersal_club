const pad = (n: number) => n.toString().padStart(2, "0");
const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => formatDate(new Date());
const firstOfMonthStr = () => { const d = new Date(); d.setDate(1); return formatDate(d); };

export const artistDateState = {
  fromDate: firstOfMonthStr(),
  toDate: todayStr(),
};
