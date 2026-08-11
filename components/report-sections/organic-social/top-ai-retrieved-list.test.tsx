import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TopAiRetrievedList } from './top-ai-retrieved-list'

test('ranks owned content and shows retrievals + empty state', () => {
  const { getByText, rerender, queryByText } = render(
    <TopAiRetrievedList items={[{ url: 'https://x/pulse/a', title: 'Article A', retrievals: 230, engines: ['ChatGPT'] }]} />,
  )
  expect(getByText('Article A')).toBeTruthy()
  expect(getByText('230')).toBeTruthy()
  rerender(<TopAiRetrievedList items={[]} />)
  expect(queryByText(/no ai-retrieved/i)).toBeTruthy()   // legible empty state
})
