import React, { useEffect } from 'react';
import { PowerBIEmbed } from 'powerbi-client-react';
import { models } from 'powerbi-client';

const PowerBiChart = () => {

  const embedConfig = {
    type: 'report',   // Supported types: report, dashboard, tile, visual and qna
    id: '6d7a723d-faf6-44cc-b354-a427b7aca844',  // Replace with your report id
    embedUrl: 'https://app.powerbi.com/view?r=eyJrIjoiOGVjNjViN2YtNGNjMi00ZTZmLWI0MzUtNGI5MzRiZTE0YmIxIiwidCI6ImY2ZjRhNjkyLTQzYjMtNDMzYi05MmIyLTY1YzRlNmNjZDkyMCIsImMiOjEwfQ%3D%3D',
    accessToken: 'your-access-token',  // Replace with your Power BI access token
    tokenType: models.TokenType.Embed,
    settings: {
      filterPaneEnabled: false,
      navContentPaneEnabled: false,
    }
  };

  return (
    <div>PowerBiChart</div>
  )
}

export default PowerBiChart