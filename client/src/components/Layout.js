import React from "react";
import { Outlet } from "react-router-dom";
import { Container } from "react-bootstrap";
import TopNav from "./TopNav";

export default function Layout() {
  return (
    <>
      <TopNav />
      <Container fluid className="py-4 px-4">
        <Outlet />
      </Container>
      <div className="plasu-footer">
        Plateau State University, Bokkos &mdash; Store Management Information System
      </div>
    </>
  );
}
