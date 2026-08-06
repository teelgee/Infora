import React from 'react';

/** A project row on the workspace landing. The numeral is progress, not a %. */
export function ProjectCard({ title, subtitle, count, countQuiet, action, href, onClick }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className="project-card" href={href} onClick={onClick}>
      <span className={countQuiet ? 'num quiet' : 'num'}>{count}</span>
      <span style={{ flex: 1 }}>
        <span className="t" style={{ display: 'block' }}>{title}</span>
        {subtitle && <span className="s" style={{ display: 'block' }}>{subtitle}</span>}
      </span>
      {action}
    </Tag>
  );
}
