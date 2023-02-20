import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { isAddress } from '../../utils/index.js'
import EthereumLogo from '../../assets/eth.png'
import ObolLogo from '../../assets/tokens/obol.svg'
import BshareLogo from '../../assets/tokens/bshare.svg'
import FtmLogo from '../../assets/tokens/ftm.svg'
import BasedLogo from '../../assets/tokens/based.svg'
import UsdcLogo from '../../assets/tokens/usdc.svg'
import TombLogo from '../../assets/tokens/tomb.svg'
import SmeltLogo from '../../assets/tokens/smelt.svg'


const BAD_IMAGES = {}

const Inline = styled.div`
  display: flex;
  align-items: center;
  align-self: center;
`

const Image = styled.img`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  // background-color: white;
  border-radius: 20%;
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
`

const StyledEthereumLogo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  > img {
    width: ${({ size }) => size};
    height: ${({ size }) => size};
  }
`

export default function TokenLogo({ address, header = false, size = '24px', ...rest }) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [address])

  if (error || BAD_IMAGES[address]) {
    return (
      <Inline>
        <span {...rest} alt={''} style={{ fontSize: size }} role="img" aria-label="face">
          🤔
        </span>
      </Inline>
    )
  }

  // hard coded fixes for trust wallet api issues
  if (address?.toLowerCase() === '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb') {
    address = '0x42456d7084eacf4083f1140d3229471bba2949a8'
  }

  if (address?.toLowerCase() === '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f') {
    address = '0xc011a72400e58ecd99ee497cf89e3775d4bd732f'
  }

  if (address?.toLowerCase() === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') {
    return (
      <StyledEthereumLogo size={size} {...rest}>
        <img
          src={BasedLogo}
          style={{
            boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
            borderRadius: '24px',
          }}
          alt=""
        />
      </StyledEthereumLogo>
    )
  }

  // const path = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${isAddress(
  //   address
  // )}/logo.png`
  //   const path = `${images/isAddress(
  //   address
  // )}/.svg`


  function getImagePath(address){
    if( address === "0x49c290ff692149a4e16611c694fded42c954ab7a" ) {
      return BshareLogo;
    }
    else if( address === "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83" ) {
      return FtmLogo;
    }
    else if( address === "0x8d7d3409881b51466b483b11ea1b8a03cded89ae" ){
      return BasedLogo;
    }
    else if( address === "0x141faa507855e56396eadbd25ec82656755cd61e") {
      return SmeltLogo;
    }
    else if( address === "0x1539c63037d95f84a5981f96e43850d1451b6216" ) {
      return ObolLogo;
    }
    else if( address === "0x04068da6c83afcfa0e13ba15a6696662335d5b75"){
      return UsdcLogo;
    }
    else if( address === "0x6c021ae822bea943b2e66552bde1d2696a53fbb7"){
      return TombLogo;
    }
    else if( address === "0x8d7d3409881b51466b483b11ea1b8a03cded89ae"){
      return BasedLogo;
    }
  }

  return (
    <Inline>
      <Image
        {...rest}
        alt={''}
        src={getImagePath(address)}
        size={size}
        onError={(event) => {
          BAD_IMAGES[address] = true
          setError(true)
          event.preventDefault()
        }}
      />
    </Inline>
  )
}
