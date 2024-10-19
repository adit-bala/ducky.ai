import { Button, Flex, Separator, Text } from "@radix-ui/themes";

import styles from "./NavigationBar.module.scss";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, getUser } from "@/lib/api";
import { ArrowRightIcon, ExitIcon } from "@radix-ui/react-icons";

export default function NavigationBar() {
  const { data, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUser(),
  });

  return (
    <Flex direction="column" className={styles.root} flexShrink="0">
      <Flex p="3" gap="3" justify="between" align="center">
        <Text size="3" weight="bold" color="yellow">
          Ducky.ai
        </Text>
        {data ? (
          <Flex align="center" gap="3">
            <Flex direction="column" flexGrow="1">
              <Text size="1" weight="medium" align="right">
                {data.name}
              </Text>
              <Text size="1" color="gray" align="right">
                {data.email}
              </Text>
            </Flex>
            <Separator orientation="vertical" size="1" />
            <a href={`${API_BASE}/sign-out`}>
              <Button variant="surface" color="gray">
                <ExitIcon />
                Sign out
              </Button>
            </a>
          </Flex>
        ) : (
          <a href={`${API_BASE}/sign-in`}>
            <Button variant="classic" loading={isLoading}>
              Sign in
              <ArrowRightIcon />
            </Button>
          </a>
        )}
      </Flex>
      <Separator size="4" />
    </Flex>
  );
}
