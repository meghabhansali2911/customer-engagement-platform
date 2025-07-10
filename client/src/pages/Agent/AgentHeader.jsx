import React from "react";
import { AppBar, Toolbar, Avatar, Typography, Box } from "@mui/material";

const agentName = "Agent";

const AgentHeader = () => {
  const initial = agentName.charAt(0).toUpperCase();

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: "black",
        color: "white",
        borderBottom: "1px solid #e0e0e0",
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          px: 2,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Avatar sx={{ width: 28, height: 28 }}>{initial}</Avatar>
          <Typography variant="h6">{agentName}</Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default AgentHeader;
