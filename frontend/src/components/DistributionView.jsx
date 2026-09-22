import { useEffect, useMemo, useState } from 'react'

const pct = (r) => `${(r * 100).toFixed(1)}%`

/**
 * 跨文档编码分布对比视图：对全部文档按所选编码汇总标注字符数、标注段数
 * 与占文档长度比例，按文档标题稳定排序。
 *
 * 数据来自 GET /api/coding-distribution（后端在单一快照中计算，不修改原标注）：
 *  - 行 = 文档（按标题稳定排序），列 = 编码；
 *  - 指标可在标注字符数 / 标注段数 / 占文档长度比例间切换；
 *  - 每个单元格下方标注相对该编码「文档均值」的差异百分比，便于横向对比；
 *  - 顶部可按文档筛选行；编码筛选沿用侧栏编码本复选框；
 *  - 点击有标注的单元格：经 onLocateCell 切换到该文档正文并定位首个片段；
 *  - 后端回传缺失编码与空文档提示，本视图原样展示。
 */
export default function DistributionView({ stats, loading, error, onLocateCell }) {
  const [metric, setMetric] = useState('chars') // chars | segments | rate
  const [hiddenDocs, setHiddenDocs] = useState(new Set()) // 被隐藏的文档 id

  const documents = stats?.documents ?? []
  const codes = stats?.codes ?? []
  const missingCodes = stats?.missing_codes ?? []
  const missingDocs = stats?.missing_documents ?? []
  const emptyDocIds = useMemo(
    () => new Set(stats?.empty_document_ids ?? []),
    [stats]
  )

  // 数据刷新后（新建/删除文档、切换筛选）清理已失效的隐藏项
  useEffect(() => {
    setHiddenDocs((cur) => {
      if (cur.size === 0) return cur
      const live = new Set(documents.map((d) => d.document_id))
      const next = new Set([...cur].filter((id) => live.has(id)))
      return next.size === cur.size ? cur : next
    })
  }, [documents])

  const visibleDocs = useMemo(
    () => documents.filter((d) => !hiddenDocs.has(d.document_id)),
    [documents, hiddenDocs]
  )

  const codeMap = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])
  const cellOf = (doc, codeId) =>
    doc.codes.find((c) => c.code_id === codeId) ?? null

  // 每个编码列在「当前显示文档」中的均值（差异百分比的比较基线）
  const columnAvg = useMemo(() => {
    const m = new Map()
    for (const c of codes) {
      const values = visibleDocs.map((d) => metricValue(cellOf(d, c.id), metric))
      const avg = values.length
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : 0
      m.set(c.id, avg)
    }
    return m
  }, [codes, visibleDocs, metric])

  // 着色基准：当前指标下各列最大值（字符数/段数跨文档不可比，逐列归一化）
  const columnMax = useMemo(() => {
    const m = new Map()
    for (const c of codes) {
      m.set(
        c.id,
        Math.max(0, ...visibleDocs.map((d) => metricValue(cellOf(d, c.id), metric)))
      )
    }
    return m
  }, [codes, visibleDocs, metric])

  function toggleDoc(id) {
    setHiddenDocs((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const codeName = (id) => codeMap.get(id)?.name ?? `#${id}`
  const codeColor = (id) => codeMap.get(id)?.color ?? '#999'

  // 全表合计（当前显示文档）
  const totalCodingCount = visibleDocs.reduce((s, d) => s + d.coding_count, 0)

  return (
    <div className="dist-panel">
      <div className="cooc-toolbar">
        <div className="metric-toggle" role="group" aria-label="分布指标">
          <button
            className={metric === 'chars' ? 'active' : ''}
            onClick={() => setMetric('chars')}
          >
            标注字符数
          </button>
          <button
            className={metric === 'segments' ? 'active' : ''}
            onClick={() => setMetric('segments')}
          >
            标注段数
          </button>
          <button
            className={metric === 'rate' ? 'active' : ''}
            onClick={() => setMetric('rate')}
          >
            占文档长度比例
          </button>
        </div>
        <p className="hint">
          口径：先合并同一编码重叠/相邻的区间，再统计覆盖字符数与段数，共享字符不重复计数；
          占比 = 覆盖字符数 ÷ 文档长度。行按文档标题稳定排序，单元格下方为相对该编码文档均值的差异；
          点击有标注的单元格可切换到该文档正文并定位首个片段。
        </p>
      </div>

      {loading && <div className="cooc-status">跨文档分布统计加载中…</div>}
      {!loading && error && <div className="cooc-status error">{error}</div>}

      {!loading && !error && (
        <>
          {missingCodes.length > 0 && (
            <div className="dist-notice warn">
              有 {missingCodes.length} 个筛选编码已不存在（id：
              {missingCodes.map((c) => ` #${c.id}`).join('，')}），已自动跳过。
            </div>
          )}
          {missingDocs.length > 0 && (
            <div className="dist-notice warn">
              有 {missingDocs.length} 个筛选文档已不存在（id：
              {missingDocs.map((d) => ` #${d.id}`).join('，')}），已自动跳过。
            </div>
          )}

          {documents.length === 0 && (
            <div className="cooc-status">暂无可对比的文档，请先在顶栏新建文档。</div>
          )}
          {documents.length > 0 && visibleDocs.length === 0 && (
            <div className="cooc-status">全部文档均被隐藏，请在下方文档筛选中勾选。</div>
          )}
          {codes.length === 0 && documents.length > 0 && (
            <div className="cooc-status">
              当前筛选条件下没有参与对比的编码，请在侧栏编码本中勾选编码。
            </div>
          )}

          {documents.length > 0 && (
            <div className="dist-doc-filter">
              <span className="filter-label">文档筛选：</span>
              {documents.map((d) => {
                const id = d.document_id
                const hidden = hiddenDocs.has(id)
                return (
                  <label key={id} className={hidden ? 'dimmed' : ''}>
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleDoc(id)}
                    />
                    {d.title}
                  </label>
                )
              })}
              <button
                className="link-btn"
                onClick={() => setHiddenDocs(new Set())}
              >
                全选
              </button>
              <button
                className="link-btn"
                onClick={() =>
                  setHiddenDocs(new Set(documents.map((d) => d.document_id)))
                }
              >
                全不选
              </button>
            </div>
          )}

          {visibleDocs.length > 0 && emptyDocIds.size > 0 && (
            <div className="dist-notice">
              {(() => {
                const shownEmpty = visibleDocs.filter((d) =>
                  emptyDocIds.has(d.document_id)
                )
                const names = [...emptyDocIds]
                  .map(
                    (id) =>
                      documents.find((d) => d.document_id === id)?.title ??
                      `#${id}`
                  )
                  .join('、')
                if (shownEmpty.length > 0) {
                  return (
                    <>
                      当前显示的文档中有 {shownEmpty.length} 个没有任何编码标注
                      （{shownEmpty.map((d) => d.title).join('、')}
                      {emptyDocIds.size > shownEmpty.length
                        ? `；另有 ${emptyDocIds.size - shownEmpty.length} 个被隐藏`
                        : ''}
                      ），其分布一律为 0。
                    </>
                  )
                }
                return (
                  <>
                    被隐藏的文档中有 {emptyDocIds.size} 个没有任何编码标注（{names}）。
                  </>
                )
              })()}
            </div>
          )}

          {visibleDocs.length > 0 && codes.length > 0 && (
            <div className="cooc-matrix-wrap">
              <table className="dist-table">
                <thead>
                  <tr>
                    <th className="corner">
                      文档（{visibleDocs.length}）
                    </th>
                    {codes.map((c) => (
                      <th key={c.id} title={c.name}>
                        <span className="dot" style={{ background: c.color }} />
                        <span className="th-name">{c.name}</span>
                      </th>
                    ))}
                    <th className="dist-col-total" title="该文档的原始标注总数">
                      标注总数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDocs.map((d) => (
                    <tr key={d.document_id}>
                      <th scope="row" title={`全文 ${d.length} 字`}>
                        <span className="dist-doc-name">{d.title}</span>
                        <small>{d.length} 字</small>
                      </th>
                      {codes.map((c) => {
                        const cell = cellOf(d, c.id)
                        return (
                          <DistributionCell
                            key={c.id}
                            cell={cell}
                            metric={metric}
                            avg={columnAvg.get(c.id) ?? 0}
                            max={columnMax.get(c.id) ?? 0}
                            onClick={() =>
                              cell?.first_segment &&
                              onLocateCell({
                                documentId: d.document_id,
                                segment: cell.first_segment,
                                codeName: codeName(c.id),
                                docTitle: d.title,
                              })
                            }
                          />
                        )
                      })}
                      <td className="num dist-row-total">{d.coding_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">均值（当前显示）</th>
                    {codes.map((c) => (
                      <td key={c.id} className="num">
                        {formatValue(columnAvg.get(c.id) ?? 0, metric)}
                      </td>
                    ))}
                    <td className="num dist-row-total">—</td>
                  </tr>
                  <tr>
                    <th scope="row">合计（{visibleDocs.length} 个文档）</th>
                    <td colSpan={codes.length} className="dist-foot-note">
                      共 {totalCodingCount} 条原始标注（重叠标注未合并前的条数）
                    </td>
                    <td className="num dist-row-total">{totalCodingCount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 按当前指标取单元格数值 */
function metricValue(cell, metric) {
  if (!cell) return 0
  if (metric === 'chars') return cell.char_count
  if (metric === 'segments') return cell.segment_count
  return cell.coverage_rate
}

function formatValue(v, metric) {
  if (metric === 'rate') return pct(v)
  return String(v)
}

/** 单元格：主数值 + 相对列均值的差异百分比；有片段时可点击定位 */
function DistributionCell({ cell, metric, avg, max, onClick }) {
  const value = metricValue(cell, metric)
  const seg = cell?.first_segment ?? null
  const disabled = !seg
  let diffText = '—'
  let diffClass = 'dist-diff'
  if (!disabled && avg > 0) {
    const ratio = (value - avg) / avg
    diffText = `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(1)}% vs 均值`
    diffClass += ratio > 0 ? ' up' : ratio < 0 ? ' down' : ''
  } else if (!disabled) {
    diffText = '均值 0'
  }
  const bg =
    disabled || max === 0
      ? '#fff'
      : `rgba(37, 99, 235, ${(0.12 + 0.7 * (value / max)).toFixed(3)})`
  const title = seg
    ? `标注 ${cell.char_count} 字符 / ${cell.segment_count} 段，覆盖率 ${pct(
        cell.coverage_rate
      )}；点击定位首个片段 [${seg.start}, ${seg.end})`
    : '该文档在此编码下没有标注'
  return (
    <td className="dist-cell-td">
      <button
        type="button"
        className={`dist-cell ${disabled ? '' : 'clickable'}`}
        disabled={disabled}
        style={{ background: bg }}
        title={title}
        onClick={onClick}
      >
        <strong>{formatValue(value, metric)}</strong>
        <small className={diffClass}>{diffText}</small>
      </button>
    </td>
  )
}
