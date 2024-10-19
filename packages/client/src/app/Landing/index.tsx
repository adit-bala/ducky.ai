import NavigationBar from "@/components/NavigationBar";
import { Flex, Container } from "@radix-ui/themes";

export default function Landing() {
  return (
    <Flex direction="column" flexGrow="1">
      <NavigationBar />
      <Container></Container>
    </Flex>
  );
}
