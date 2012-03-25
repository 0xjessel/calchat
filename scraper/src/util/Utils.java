package util;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashSet;
import java.util.Set;

import model.ClassModel;

import org.json.JSONObject;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.Pipeline;

public class Utils {
	public static final String[] TERMS = { "SP", "SU", "FL" };
	public static final String[] TERMS_STRINGS = { "spring", "summer", "fall" };

	public static String trim(String text) {
		int start = text.length(), end = text.length();
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				start = i;
				break;
			}
		}

		for (int i = text.length() - 1; i >= 0; i--) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				end = i + 1;
				break;
			}
		}

		if (start >= text.length() || start >= end) {
			return "";
		} else {
			return text.substring(start, end);
		}
	}

	private static final String REDIS_URL = "calchat.net";
	// private static final String REDIS_URL = "localhost";

	private static Jedis jedis;
	private static Pipeline pipeline;

	public static void save(ClassModel m) {
		String id = getClassId(m);

		synchronized (buildings) {
			if (!savedBuildings.contains(m.building)
					&& buildings.add(m.building)) {
				System.err.println(String.format("Found new building: %s",
						m.building));
				buildings.notify();
			}
		}

		// classtimes
		String[] days = m.days.split("(?=\\p{Upper})");
		for (String day : days) {
			if (day.equals("")) {
				continue;
			}
			String key = String.format("room:%s:%s:%s:%s", m.building,
					m.buildingNumber, day, m.term).replace(" ", "");
			String field = m.time.replace(" ", "");

			pipeline.hset(key, field, id);
		}

		// classes
		try {
			for (Field field : ClassModel.class.getFields()) {
				String key = String.format("class:%s", id);
				String value = (String) field.get(m);

				pipeline.hset(key, field.getName(), value);
			}
		} catch (IllegalArgumentException e) {
			e.printStackTrace();
		} catch (IllegalAccessException e) {
			e.printStackTrace();
		}

	}

	public static String getClassId(ClassModel m) {
		return String.format("%s:%s:%s", m.department, m.number, m.term)
				.replace(" ", "");
	}

	public static boolean connect() {
		try {
			jedis = new Jedis(REDIS_URL);
			jedis.connect();
			jedis.flushDB();

			pipeline = jedis.pipelined();

			buildings = new HashSet<String>();
			savedBuildings = new HashSet<String>();

			saveLocationsThread = new Thread(new Runnable() {

				@Override
				public void run() {
					saveLocations();
				}
			});
			saveLocationsAlive = true;
			saveLocationsThread.start();

			return true;
		} catch (Exception exception) {
			return false;
		}
	}

	public static void disconnect() {
		// wait for saveLocationsThread to finish
		System.err.println("Waiting for locations to be saved...");
		synchronized (buildings) {
			saveLocationsAlive = false;
			buildings.notify();
		}
	}

	// called from saveLocationsThread
	private static void disconnectHelper() {
		System.err.println("Disconnecting from Redis server...");
		
		pipeline.sync();
		pipeline = null;
		jedis.disconnect();
		jedis = null;

		buildings = null;
		savedBuildings = null;
	}

	private static final String MAPS_URL = "http://maps.google.com/maps/api/geocode/json?address=%s,Berkeley,CA&sensor=false";

	private static Set<String> buildings;
	private static Set<String> savedBuildings;

	private static Thread saveLocationsThread;
	private static boolean saveLocationsAlive;

	public static void saveLocations() {
		while (true) {
			String building = null;
			synchronized (buildings) {
				if (buildings.isEmpty()) {
					if (saveLocationsAlive) {
						try {
							buildings.wait();
							continue;
						} catch (InterruptedException e1) {
							// TODO Auto-generated catch block
							e1.printStackTrace();
						}
					} else {
						disconnectHelper();
						return;
					}
				}

				building = buildings.toArray(new String[] {})[0];
				buildings.remove(building);
				savedBuildings.add(building);
			}

			try {
				saveLocation(building);
			} catch (InterruptedException e) {
				// TODO Auto-generated catch block
				e.printStackTrace();
			}
		}
	}

	public static void saveLocation(final String building)
			throws InterruptedException {
		String key = String.format("location:%s", building.replace(" ", ""));

		HttpURLConnection connection = null;
		JSONObject json = null;
		try {
			String url = String.format(MAPS_URL,
					URLEncoder.encode(building, "UTF-8"));
			connection = (HttpURLConnection) new URL(url).openConnection();

			BufferedReader rd = new BufferedReader(new InputStreamReader(
					connection.getInputStream(), "UTF-8"));

			StringBuilder sb = new StringBuilder();
			String line;
			while ((line = rd.readLine()) != null) {
				sb.append(line);
			}
			rd.close();

			json = new JSONObject(sb.toString());

			// check for failure
			if ("Berkeley, CA, USA".equals(json.getJSONArray("results")
					.getJSONObject(0).getString("formatted_address"))) {
				System.err.println(String.format("E: Couldn't locate: %s",
						building));
				return;
			}

			JSONObject locationJson = json.getJSONArray("results")
					.getJSONObject(0).getJSONObject("geometry")
					.getJSONObject("location");
			String location = String.format("%f,%f",
					locationJson.getDouble("lat"),
					locationJson.getDouble("lng"));

			pipeline.set(key, location);

			System.err.println(String.format("Found new location: %s (%s)",
					building, location));
		} catch (Exception ex) {
			ex.printStackTrace();
			System.err.println(json.toString());
		} finally {
			if (connection != null)
				connection.disconnect();

			try {
				// avoid Google Maps rate-limit
				Thread.sleep(500);
			} catch (InterruptedException e) {
				e.printStackTrace();
			}
		}
	}

	public static void main(String[] args) {
		connect();

		synchronized (buildings) {
			buildings.add("tan");
			buildings.notify();
			buildings.add("soda");
			buildings.notify();
			buildings.add("etcheverry");
			buildings.notify();
			buildings.add("cory");
			buildings.notify();
		}

		disconnect();
	}
}
