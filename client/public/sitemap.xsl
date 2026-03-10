<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sitemap image">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="it">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex, follow"/>
        <title>Sitemap XML — Image Studio</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f0e8;
            color: #3a3a3a;
            min-height: 100vh;
          }

          header {
            background: #4a5e4a;
            color: #f5f0e8;
            padding: 32px 40px;
            border-bottom: 3px solid #c4724a;
          }

          header .logo {
            font-size: 11px;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: #a8bba8;
            margin-bottom: 6px;
          }

          header h1 {
            font-size: 24px;
            font-weight: 600;
            color: #f5f0e8;
            margin-bottom: 4px;
          }

          header p {
            font-size: 13px;
            color: #a8bba8;
          }

          .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 32px 24px;
          }

          .stats {
            display: flex;
            gap: 16px;
            margin-bottom: 28px;
            flex-wrap: wrap;
          }

          .stat-card {
            background: white;
            border: 1px solid #e8e0d4;
            border-radius: 8px;
            padding: 16px 24px;
            flex: 1;
            min-width: 140px;
          }

          .stat-card .number {
            font-size: 28px;
            font-weight: 700;
            color: #c4724a;
          }

          .stat-card .label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 2px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 1px 4px rgba(0,0,0,0.07);
          }

          thead tr {
            background: #4a5e4a;
            color: #f5f0e8;
          }

          thead th {
            padding: 14px 16px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }

          tbody tr {
            border-bottom: 1px solid #f0ebe3;
            transition: background 0.15s;
          }

          tbody tr:last-child { border-bottom: none; }

          tbody tr:hover { background: #fdf9f5; }

          td {
            padding: 12px 16px;
            font-size: 13px;
            vertical-align: middle;
          }

          td a {
            color: #4a5e4a;
            text-decoration: none;
            word-break: break-all;
          }

          td a:hover {
            color: #c4724a;
            text-decoration: underline;
          }

          .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            text-transform: capitalize;
          }

          .badge-daily    { background: #fef3e2; color: #c4724a; }
          .badge-weekly   { background: #e8f0e8; color: #4a5e4a; }
          .badge-monthly  { background: #e8eaf0; color: #5a6a8a; }
          .badge-yearly   { background: #f0f0f0; color: #888; }

          .priority-high   { color: #c4724a; font-weight: 700; }
          .priority-medium { color: #4a5e4a; font-weight: 600; }
          .priority-low    { color: #999; }

          .tag-blog { 
            background: #fef3e2; 
            color: #c4724a; 
            font-size: 10px; 
            padding: 1px 6px; 
            border-radius: 4px; 
            margin-left: 6px;
            font-weight: 500;
            vertical-align: middle;
          }

          footer {
            text-align: center;
            padding: 28px;
            font-size: 12px;
            color: #aaa;
          }

          footer a { color: #c4724a; text-decoration: none; }
        </style>
      </head>
      <body>
        <header>
          <div class="logo">Image Studio — Memorie Sospese</div>
          <h1>Sitemap XML</h1>
          <p>Mappa del sito per motori di ricerca e crawler — <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URL indicizzati</p>
        </header>

        <div class="container">
          <div class="stats">
            <div class="stat-card">
              <div class="number"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></div>
              <div class="label">URL totali</div>
            </div>
            <div class="stat-card">
              <div class="number">
                <xsl:value-of select="count(sitemap:urlset/sitemap:url[contains(sitemap:loc, '/blog/')])"/>
              </div>
              <div class="label">Articoli blog</div>
            </div>
            <div class="stat-card">
              <div class="number">
                <xsl:value-of select="count(sitemap:urlset/sitemap:url[contains(sitemap:loc, '/portfolio')])"/>
              </div>
              <div class="label">Pagine portfolio</div>
            </div>
            <div class="stat-card">
              <div class="number">
                <xsl:value-of select="count(sitemap:urlset/sitemap:url[sitemap:priority >= 0.9])"/>
              </div>
              <div class="label">Priorità alta</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>URL</th>
                <th>Ultima modifica</th>
                <th>Frequenza</th>
                <th>Priorità</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <xsl:variable name="loc" select="sitemap:loc"/>
                <tr>
                  <td style="color:#ccc;font-size:11px;width:40px">
                    <xsl:value-of select="position()"/>
                  </td>
                  <td>
                    <a href="{$loc}" target="_blank" rel="noopener">
                      <xsl:value-of select="$loc"/>
                    </a>
                    <xsl:if test="contains($loc, '/blog/')">
                      <span class="tag-blog">blog</span>
                    </xsl:if>
                  </td>
                  <td style="white-space:nowrap;color:#888;font-size:12px">
                    <xsl:value-of select="sitemap:lastmod"/>
                    <xsl:if test="not(sitemap:lastmod)">—</xsl:if>
                  </td>
                  <td>
                    <xsl:variable name="freq" select="sitemap:changefreq"/>
                    <span>
                      <xsl:attribute name="class">
                        <xsl:choose>
                          <xsl:when test="$freq = 'daily'">badge badge-daily</xsl:when>
                          <xsl:when test="$freq = 'weekly'">badge badge-weekly</xsl:when>
                          <xsl:when test="$freq = 'monthly'">badge badge-monthly</xsl:when>
                          <xsl:otherwise>badge badge-yearly</xsl:otherwise>
                        </xsl:choose>
                      </xsl:attribute>
                      <xsl:value-of select="$freq"/>
                      <xsl:if test="not($freq)">—</xsl:if>
                    </span>
                  </td>
                  <td style="text-align:center">
                    <xsl:variable name="pri" select="sitemap:priority"/>
                    <span>
                      <xsl:attribute name="class">
                        <xsl:choose>
                          <xsl:when test="$pri >= 0.9">priority-high</xsl:when>
                          <xsl:when test="$pri >= 0.6">priority-medium</xsl:when>
                          <xsl:otherwise>priority-low</xsl:otherwise>
                        </xsl:choose>
                      </xsl:attribute>
                      <xsl:value-of select="$pri"/>
                      <xsl:if test="not($pri)">—</xsl:if>
                    </span>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>

        <footer>
          <a href="https://imagestudiofotografico.com">imagestudiofotografico.com</a>
          — Sitemap generata dinamicamente da Firestore
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
