import React from 'react';

const LoadingButton = ({
  children,
  loading,
  onClick,
  disabled = false,
  loadingText = '加载中...',
  style = {},
  className = '',
  title = '',
  ...props
}) => {
  const defaultStyle = {
    padding: '2px 8px',
    background: loading ? '#1a1a2e' : '#23263a',
    color: loading ? '#888' : '#fff',
    border: `1px solid ${loading ? '#333' : '#444'}`,
    borderRadius: '3px',
    cursor: loading || disabled ? 'not-allowed' : 'pointer',
    fontWeight: 'normal',
    fontSize: '12px',
    outline: 'none',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: loading ? 0.7 : 1,
    position: 'relative',
    ...style
  };

  const handleMouseOver = (e) => {
    if (!loading && !disabled) {
      e.target.style.background = '#333';
      e.target.style.borderColor = '#1e90ff';
    }
  };

  const handleMouseOut = (e) => {
    if (!loading && !disabled) {
      e.target.style.background = '#23263a';
      e.target.style.borderColor = '#444';
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <button
        onClick={onClick}
        disabled={loading || disabled}
        style={defaultStyle}
        className={className}
        title={loading ? loadingText : title}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        {...props}
      >
        {loading ? (
          <>
            <div style={{
              width: '12px',
              height: '12px',
              border: '2px solid #333',
              borderTop: '2px solid #1e90ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '4px'
            }} />
            {loadingText}
          </>
        ) : (
          children
        )}
      </button>
    </>
  );
};

export default LoadingButton;
