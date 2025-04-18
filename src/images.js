import React from 'react';
import logo from './images/discoirc.png';

function GetLogo() {
  return (
    <img
      src={require('logo')}
      alt="Logo"
      style={{ width: '100px', height: 'auto' }}
    />
  );
}

export default GetLogo;