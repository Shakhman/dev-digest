import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: "1.5em", fontWeight: 650, color: "var(--text-primary)", margin: "0 0 14px", lineHeight: 1.3 }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: "1.2em",
                fontWeight: 650,
                color: "var(--text-primary)",
                margin: "22px 0 10px",
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
                lineHeight: 1.3,
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: "1.05em", fontWeight: 650, color: "var(--text-primary)", margin: "18px 0 8px", lineHeight: 1.3 }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ fontSize: "1em", fontWeight: 650, color: "var(--text-primary)", margin: "16px 0 6px" }}>
              {children}
            </h4>
          ),
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: "0 0 10px", paddingLeft: 22, listStyleType: "disc" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0 0 10px", paddingLeft: 22, listStyleType: "decimal" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "2px 14px",
                borderLeft: "3px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid var(--border)" }} />,
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                margin: "0 0 10px",
                padding: 14,
                borderRadius: 6,
                background: "var(--bg-hover)",
                overflow: "auto",
                fontSize: "0.88em",
                lineHeight: 1.5,
              }}
            >
              {children}
            </pre>
          ),
          code: ({ className, children }) =>
            className ? (
              <code className={`${className} mono`}>{children}</code>
            ) : (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div style={{ overflow: "auto", marginBottom: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.95em" }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderBottom: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontWeight: 650,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
              {children}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
