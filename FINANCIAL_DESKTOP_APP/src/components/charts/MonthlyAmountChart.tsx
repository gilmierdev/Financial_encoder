import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlySummary } from '../../../electron/types/ipc'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type AmountKind = 'income' | 'expense' | 'capital' | 'withdrawal'

const KIND_LABELS: Record<AmountKind, string> = {
  income: 'Income',
  expense: 'Expenses',
  capital: 'Capital',
  withdrawal: 'Withdrawals',
}

const KIND_COLORS: Record<AmountKind, string> = {
  income: 'var(--success)',
  expense: 'var(--danger)',
  capital: 'var(--accent)',
  withdrawal: 'var(--warning)',
}

function formatLabel(month: string): string {
  const parts = month.split('-')
  const m = Number(parts[1])
  return `${MONTH_NAMES[m - 1]} ${parts[0]}`
}

interface MonthlyAmountChartProps {
  data: MonthlySummary[]
  kind: AmountKind
  currencyCode: string
  height?: number
}

function MonthlyAmountChart({ data, kind, currencyCode, height = 220 }: MonthlyAmountChartProps): React.JSX.Element {
  const chartData = data.map((row) => ({
    month: formatLabel(row.month),
    amount: row[kind],
  }))

  if (chartData.length === 0) {
    return (
      <div className="chart-empty" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 13, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 13, fill: 'var(--text-muted)' }} width={80} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
          }}
          formatter={(value) => [
            new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2 }).format(Number(value)),
            KIND_LABELS[kind],
          ]}
        />
        <Bar dataKey="amount" name={KIND_LABELS[kind]} fill={KIND_COLORS[kind]} radius={[4, 4, 0, 0]} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default MonthlyAmountChart