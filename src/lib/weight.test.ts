import { describe, expect, it } from 'vitest'
import { chartRuler, transitWeight, weightText } from './weight.ts'

describe('transit weight', () => {
  it('names the chart ruler from the Ascendant', () => {
    expect(chartRuler(0)).toBe('Mars')
    expect(chartRuler(243.78)).toBe('Jupiter')
    expect(chartRuler(359.9)).toBe('Jupiter')
    expect(chartRuler(-10)).toBe('Jupiter')
    expect(chartRuler(300)).toBe('Saturn')
  })

  it('weighs slowness, the key points and the aspect the way the forecasts do', () => {
    expect(transitWeight('Pluto', 'Sun', 'Conjunction', null)).toBe(10)
    expect(transitWeight('Jupiter', 'Sun', 'Square', null)).toBe(5.4)
    expect(transitWeight('Mercury', 'Chiron', 'Sextile', null)).toBe(0.25)
    expect(transitWeight('Mercury', 'Chiron', 'Sextile', 'Chiron')).toBe(0.5)
    expect(transitWeight('Mars', 'Asc', 'Trine', 'Jupiter')).toBe(1.4)
    expect(transitWeight('Moon', 'Mars', 'Opposition', null)).toBe(0.2)
    expect(transitWeight('True North Node', 'Sun', 'Square', null)).toBeNull()
    expect(transitWeight('Mars', 'Sun', 'Quincunx', null)).toBeNull()
  })

  it('writes the number plainly', () => {
    expect(weightText(5.4)).toBe('5.4')
    expect(weightText(0.25)).toBe('0.25')
    expect(weightText(10)).toBe('10')
  })
})
