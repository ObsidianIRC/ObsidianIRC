import React from 'react';
import logo from './images/obsidian.png';

function GetLogo() {
  return (
    <img
      src={logo}
      alt="Logo"
      style={{ width: '100px', height: 'auto' }}
    />
  );
}

export default GetLogo;
