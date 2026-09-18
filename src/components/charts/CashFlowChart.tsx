import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { computeChartYDomain, type CashFlowChartDatum } from '../../utils/chart'
import { formatCompactCurrency, formatCurrency, toFiniteNumber } from '../../utils/currency'

export interface CashFlowLabels {
  inflow: string
  outflow: string
  net: string
}

const DEFAULT_LABELS: CashFlowLabels = {
  inflow: 'Income',
  outflow: 'Expenses',
  net: 'Net Cash Flow',
}

interface TooltipPayloadItem {
  dataKey?: string | number
  value?: number | string
  payload?: CashFlowChartDatum
}

interface CashFlowTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  currencyCode: string
  labels: CashFlowLabels
}

function CashFlowTooltip({ active, payload, label, currencyCode, labels }: CashFlowTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null
  }
  const datum = payload[0]?.payload
  if (!datum) {
    return null
  }

  const inflow = toFiniteNumber(datum.inflow)
  const outflow = toFiniteNumber(datum.outflow)
  const net = toFiniteNumber(datum.net)

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{datum.fullLabel || label}</p>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-tooltip__dot" style={{ background: 'var(--success)' }} />
          {labels.inflow}
        </span>
        <span className="chart-tooltip__value cf-positive">{formatCurrency(inflow, currencyCode)}</span>
      </div>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-tooltip__dot" style={{ background: 'var(--danger)' }} />
          {labels.outflow}
        </span>
        <span className="chart-tooltip__value cf-negative">{formatCurrency(outflow, currencyCode)}</span>
      </div>
      <div className="chart-tooltip__row chart-tooltip__row--net">
        <span className="chart-tooltip__label">
          <span className="chart-tooltip__dot" style={{ background: 'var(--accent)' }} />
          {labels.net}
        </span>
        <span className={`chart-tooltip__value ${net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
          {formatCurrency(net, currencyCode)}
        </span>
      </div>
    </div>
  )
}

interface CashFlowChartProps {
  data: CashFlowChartDatum[]
  currencyCode: string
  height?: number
  labels?: Partial<CashFlowLabels>
}

function CashFlowChart({ data, currencyCode, height = 300, labels: labelOverrides }: CashFlowChartProps): React.JSX.Element {
  const labels: CashFlowLabels = { ...DEFAULT_LABELS, ...labelOverrides }

  const chartData = data.map((datum) => ({
    ...datum,
    inflow: toFiniteNumber(datum.inflow),
    outflow: -Math.abs(toFiniteNumber(datum.outflow)),
    net: toFiniteNumber(datum.net),
  }))

  const hasMovement = chartData.some(
    (datum) => datum.inflow !== 0 || datum.outflow !== 0 || datum.net !== 0,
  )

  if (chartData.length === 0 || !hasMovement) {
    return (
      <div className="chart-empty chart-empty--cashflow" style={{ height }}>
        <p className="chart-empty__title">No cash flow data for this period.</p>
        <p className="chart-empty__hint">Add income or expense transactions to see your cash flow.</p>
      </div>
    )
  }

  const domain = computeChartYDomain(chartData.flatMap((datum) => [datum.inflow, datum.outflow, datum.net]))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 4, bottom: 4 }} stackOffset="sign">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickMargin={8}
          minTickGap={20}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          width={68}
          domain={domain}
          tickFormatter={(value: number) => formatCompactCurrency(value, currencyCode)}
        />
        <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)', fillOpacity: 0.6 }}
          content={<CashFlowTooltip currencyCode={currencyCode} labels={labels} />}
        />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} iconType="circle" />
        <Bar
          dataKey="inflow"
          name={labels.inflow}
          fill="var(--success)"
          stackId="cashflow"
          maxBarSize={32}
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="outflow"
          name={labels.outflow}
          fill="var(--danger)"
          stackId="cashflow"
          maxBarSize={32}
          radius={[0, 0, 3, 3]}
        />
        <Line
          dataKey="net"
          name={labels.net}
          type="monotone"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--accent)' }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default CashFlowChart
