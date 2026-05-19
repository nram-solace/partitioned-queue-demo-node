#echo "====================================================="
#echo "Pull src from github"
#echo "====================================================="
#git pull || exit

echo "====================================================="
echo "Shutdown containers"
echo "====================================================="
sudo docker compose down
sleep 5

echo "====================================================="
echo "Recreate and start containers"
echo "====================================================="
sudo docker compose -f docker-compose.minimal.yml up -d --build --force-recreate
#sudo docker compose -f docker-compose.minimal.yml up -d --force-recreate