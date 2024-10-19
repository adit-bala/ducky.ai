import { Outlet } from "react-router-dom";
import styles from "./Layout.module.scss";
import { Flex } from "@radix-ui/themes";

export default function Layout() {
  return (
    <Flex direction="column" className={styles.root}>
      <Outlet />
    </Flex>
  );
}
