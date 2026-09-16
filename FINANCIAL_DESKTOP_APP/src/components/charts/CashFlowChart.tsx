import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlySummary } from '../../../electron/types/ipc'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatLabel(month: string): string {
  const parts = month.split('-')
  const m = Number(parts[1])
  return `${MONTH_NAMES[m - 1]} ${parts[0]}`
}

interface DataPoint {
  month: string
  inflow: number
  outflow: number
  net: number
}

function toChartData(rows: MonthlySummary[]): DataPoint[] {
  return rows.map((row) => ({
    month: formatLabel(row.month),
    inflow: row.income + row.capital,
    outflow: row.expense + row.withdrawal,
    net: (row.income + row.capital) - (row.expense + row.withdrawal),
  }))
}

interface CashFlowChartProps {
  data: MonthlySummary[]
  currencyCode: string
  height?: number
}

function CashFlowChart({ data, currencyCode, height = 300 }: CashFlowChartProps): React.JSX.Element {
  const chartData = toChartData(data)

  if (chartData.length === 0) {
    return (
      <div className="chart-empty" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
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
          formatter={(value, name) => [
            new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2 }).format(Number(value)),
            name === 'inflow' ? 'Inflows' : name === 'outflow' ? 'Outflows' : 'Net',
          ]}
        />
        <Legend
          formatter={(value: string) => (value === 'inflow' ? 'Inflows' : value === 'outflow' ? 'Outflows' : 'Net')}
          wrapperStyle={{ fontSize: 13 }}
        />
        <Bar dataKey="inflow" name="inflow" fill="var(--success)" radius={[4, 4, 0, 0]} barSize={24} />
        <Bar dataKey="outflow" name="outflow" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={24} />
        <Line dataKey="net" name="net" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default CashFlowChart