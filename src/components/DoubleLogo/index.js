import React from 'react'
import styled from 'styled-components'
import TokenLogo from '../TokenLogo'

export default function DoubleTokenLogo({ a0, a1, size = 24, margin = false }) {
  const TokenWrapper = styled.div`
    position: relative;
    display: flex;
    flex-direction: row;
    margin-right: ${({ sizeraw, margin }) => margin && (sizeraw / 3 + 8).toString() + 'px'};
  `

  const HigherLogo = styled(TokenLogo)`
    z-index: 2;
    // background-color: white;
    border-radius: 20%;
  `

  const CoveredLogo = styled(TokenLogo)`
    position: absolute;
    left: '10px'};
    // background-color: white;
    border-radius: 20%;
  `

  return (
    <TokenWrapper sizeraw={size} margin={margin}>
      <HigherLogo address={a0} size={size.toString() + 'px'} sizeraw={size} />
      <CoveredLogo address={a1} size={size.toString() + 'px'} sizeraw={size} />
    </TokenWrapper>
  )
}
