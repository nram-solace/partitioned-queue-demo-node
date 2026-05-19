echo "========================================"
echo "Running frontend"
echo "========================================"
npm run frontend > frontend.out 2>&1 &
sleep 10

echo "========================================"
echo "Running consumer"
echo "========================================"
npm run consumer > consumer.out 2>&1 &
sleep 5

echo "========================================"
echo "Running publisher"
echo "========================================"
npm run publisher > publisher.out 2>&1 &
sleep 2
